#!/usr/bin/env python3
"""
Highlands Cafe & Motel Inn - Complete QA Audit & Crawler
Uses Selenium 4 + Chrome DevTools Protocol (CDP) for comprehensive end-to-end audit.
"""

import sys
import os
import json
import time
import re
import base64
import uuid
import logging
from datetime import datetime, timezone
from urllib.parse import urljoin, urlparse, urldefrag
from dataclasses import dataclass, field, asdict
from typing import Optional

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException, NoSuchElementException, StaleElementReferenceException,
    ElementClickInterceptedException, JavascriptException, WebDriverException
)
from webdriver_manager.chrome import ChromeDriverManager
from PIL import Image
import io

# ── Config ──────────────────────────────────────────────────────────────────
BASE_URL = "http://localhost:5173"
CREDENTIALS = {"email": "ADMIN_EMAIL", "password": "ADMIN_PASSWORD"}
REPORT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report")
SCREENSHOT_DIR = os.path.join(REPORT_DIR, "screenshots")
os.makedirs(REPORT_DIR, exist_ok=True)
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

SLOW_REQUEST_THRESHOLD_MS = 5000
MAX_PAGES = 60
MAX_DEPTH = 3
PAGE_LOAD_WAIT = 5
INTERACTION_WAIT = 1

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger("QAAudit")

# ── Data Models ─────────────────────────────────────────────────────────────
@dataclass
class PageRecord:
    url: str
    title: str = ""
    status: str = "pending"  # pending, ok, error, skipped
    depth: int = 0
    load_time_ms: float = 0.0
    dom_content_ms: float = 0.0
    lcp_ms: float = 0.0
    cls_score: float = 0.0
    tti_ms: float = 0.0
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    console_entries: list = field(default_factory=list)
    network_issues: list = field(default_factory=list)
    broken_links: list = field(default_factory=list)
    ui_issues: list = field(default_factory=list)
    a11y_issues: list = field(default_factory=list)
    seo_issues: list = field(default_factory=list)
    form_issues: list = field(default_factory=list)
    screenshot_file: str = ""
    detected_links: list = field(default_factory=list)
    has_login: bool = False
    has_form: bool = False

@dataclass
class AuditReport:
    start_time: str = ""
    end_time: str = ""
    base_url: str = BASE_URL
    total_pages_discovered: int = 0
    total_pages_crawled: int = 0
    failed_pages: int = 0
    total_broken_links: int = 0
    total_console_errors: int = 0
    total_network_failures: int = 0
    total_ui_issues: int = 0
    total_a11y_issues: int = 0
    total_seo_issues: int = 0
    total_form_issues: int = 0
    avg_load_time_ms: float = 0.0
    pages: list = field(default_factory=list)
    severe_issues: list = field(default_factory=list)

# ── Helpers ─────────────────────────────────────────────────────────────────
def is_internal(url: str) -> bool:
    parsed = urlparse(url)
    return not parsed.netloc or parsed.netloc == urlparse(BASE_URL).netloc

def normalize_url(url: str) -> str:
    url, _ = urldefrag(url)
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}" if parsed.netloc else f"{BASE_URL}{parsed.path}"

def is_same_page(url1: str, url2: str) -> bool:
    return normalize_url(url1) == normalize_url(url2)

def severity_str(count: int) -> str:
    if count > 10: return "Critical"
    if count > 5: return "High"
    if count > 2: return "Medium"
    return "Low"

def truncate(s: str, n: int = 200) -> str:
    return s[:n] + "..." if len(s) > n else s

# ── Main Crawler ────────────────────────────────────────────────────────────
class QAAuditCrawler:
    def __init__(self):
        self.report = AuditReport(start_time=datetime.now(timezone.utc).isoformat())
        self.discovered = set()
        self.visited = set()
        self.to_visit = []
        self.session_id = str(uuid.uuid4())[:8]
        self.driver = None
        self.performance_metrics = {}

    def setup_driver(self):
        options = Options()
        options.add_argument("--no-sandbox")
        options.add_argument("--disable-dev-shm-usage")
        options.add_argument("--window-size=1920,1080")
        options.add_argument("--disable-gpu")
        options.add_argument("--disable-web-security")
        options.add_argument("--allow-insecure-localhost")
        options.add_argument("--ignore-certificate-errors")
        options.add_argument("--js-flags=--max_old_space_size=4096")
        options.set_capability("goog:loggingPrefs", {
            "browser": "ALL",
            "performance": "ALL"
        })
        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=options)
        self.driver.set_page_load_timeout(20)
        self.driver.implicitly_wait(3)

        # Enable CDP domains
        for domain in ["Network", "Console", "Log", "Performance"]:
            try:
                self.driver.execute_cdp_cmd(f"{domain}.enable", {})
            except Exception:
                pass

        log.info("Driver initialized with CDP domains enabled")

    def _post_login_init(self):
        """Initialize console hooks after first page load."""
        self._init_console_hooks()

    def login(self):
        log.info(f"Logging in as {CREDENTIALS['email']}")
        self.driver.get(f"{BASE_URL}/login")
        time.sleep(2)
        self._wait_for_page()

        # Try first password
        passwords = [CREDENTIALS["password"], "Pawan246!"]
        for attempt, pw_try in enumerate(passwords):
            try:
                email_input = WebDriverWait(self.driver, 3).until(
                    EC.element_to_be_clickable((By.CSS_SELECTOR, "input[type='email']"))
                )
                email_input.clear()
                email_input.send_keys(CREDENTIALS["email"])

                pw = self.driver.find_element(By.CSS_SELECTOR, "input[type='password']")
                pw.clear()
                pw.send_keys(pw_try)

                for btn in self.driver.find_elements(By.CSS_SELECTOR, "button[type='submit']"):
                    if btn.is_displayed():
                        btn.click()
                        break

                time.sleep(1.5)
                self._wait_for_page(3)
                current = self.driver.current_url
                log.info(f"Login attempt {attempt+1}: current URL: {current}")
                if "/login" not in current:
                    log.info(f"Login successful with password attempt {attempt+1}")
                    return True
            except Exception as e:
                log.warning(f"Login attempt {attempt+1} failed: {str(e)[:100]}")

        log.info("All login attempts failed")
        return False

    def _wait_for_page(self, timeout: int = PAGE_LOAD_WAIT):
        try:
            WebDriverWait(self.driver, timeout).until(
                lambda d: d.execute_script("return document.readyState") == "complete"
            )
            time.sleep(0.3)
        except TimeoutException:
            pass

    def _scroll_whole_page(self):
        try:
            last_height = self.driver.execute_script("return document.body.scrollHeight")
            for _ in range(5):
                self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
                time.sleep(0.3)
                new_height = self.driver.execute_script("return document.body.scrollHeight")
                if new_height == last_height:
                    break
                last_height = new_height
        except Exception:
            pass

    def _collect_console_logs(self) -> list:
        """Collect console errors for this page via JS console.error interception."""
        try:
            result = self.driver.execute_script("""
                const errs = window.__qaPageErrors || [];
                window.__qaPageErrors = [];
                return JSON.stringify(errs);
            """)
            if result:
                return json.loads(result)
        except Exception:
            pass
        return []

    def _init_console_hooks(self):
        """Install console.error hook once to catch runtime errors."""
        try:
            self.driver.execute_script("""
                if (!window.__qaPageErrors) {
                    window.__qaPageErrors = [];
                    const origError = console.error;
                    console.error = function() {
                        window.__qaPageErrors.push({
                            level: 'SEVERE',
                            message: Array.from(arguments).map(a =>
                                typeof a === 'object' ? (a && a.message ? a.message : JSON.stringify(a).slice(0,200)) : String(a)
                            ).join(' '),
                            source: 'console-api'
                        });
                        origError.apply(console, arguments);
                    };
                    window.addEventListener('unhandledrejection', function(e) {
                        window.__qaPageErrors.push({
                            level: 'SEVERE',
                            message: 'Unhandled Rejection: ' + (e.reason ? (e.reason.message || String(e.reason)) : 'unknown'),
                            source: 'promise'
                        });
                    });
                }
                window.__qaPageErrors = [];
            """)
        except Exception:
            pass

    def _flush_browser_logs(self) -> list:
        """Get all browser logs once (call at end of crawl)."""
        entries = []
        try:
            for entry in self.driver.get_log("browser"):
                entries.append({
                    "level": entry.get("level", ""),
                    "message": entry.get("message", ""),
                    "timestamp": entry.get("timestamp", 0),
                    "source": entry.get("source", "")
                })
        except Exception:
            pass
        return entries

    def _analyze_network_fast(self) -> list:
        """Fast network issue detection using JS Performance API."""
        issues = []
        try:
            resources = self.driver.execute_script("""
                return performance.getEntriesByType('resource').map(r => ({
                    url: r.name,
                    duration: r.duration,
                    type: r.initiatorType,
                    transferSize: r.transferSize || 0,
                    decodedBodySize: r.decodedBodySize || 0
                }));
            """)
            slow_threshold_ms = SLOW_REQUEST_THRESHOLD_MS
            for r in resources:
                r_url = r["url"]
                # Skip localhost and vite resources
                if "localhost" in r_url or "127.0.0.1" in r_url or "/@vite/" in r_url or "/node_modules/" in r_url:
                    continue
                if r["duration"] > slow_threshold_ms:
                    issues.append({
                        "url": r_url[:200],
                        "status": 0,
                        "type": "slow_request",
                        "duration_ms": round(r["duration"], 2),
                        "detail": f"Resource took {r['duration']:.0f}ms (type: {r['type']})"
                    })
                if r["transferSize"] == 0 and r["decodedBodySize"] == 0 and r["duration"] > 0:
                    issues.append({
                        "url": r_url[:200],
                        "status": 0,
                        "type": "failed_resource",
                        "duration_ms": round(r["duration"], 2),
                        "detail": f"Resource with 0 transfer size (possibly failed/cached)"
                    })
        except Exception as e:
            log.debug(f"Fast network check error: {e}")
        return issues

    def _analyze_page(self, url: str, page: PageRecord):
        """Run all analysis passes on the current page."""
        page.title = self.driver.title

        try:
            forms = self.driver.find_elements(By.TAG_NAME, "form")
            page.has_form = len(forms) > 0
            page.has_login = len(self.driver.find_elements(By.CSS_SELECTOR, "input[type='password']")) > 0
        except Exception:
            pass

        # Performance metrics via CDP
        self._capture_performance(page)

        # Console logs
        page.console_entries = self._collect_console_logs()

        # Network issues (fast path - no performance log polling)
        page.network_issues = self._analyze_network_fast()

        # UI checks
        page.ui_issues = self._check_ui()

        # Accessibility checks
        page.a11y_issues = self._check_accessibility()

        # SEO checks
        page.seo_issues = self._check_seo()

        # Form validation (lightweight - skip slow checks)
        if page.has_form:
            quick_issues = []
            try:
                forms = self.driver.find_elements(By.TAG_NAME, "form")
                for fi, f in enumerate(forms):
                    if not f.find_elements(By.CSS_SELECTOR, "button[type='submit'], input[type='submit']"):
                        quick_issues.append({"type": "missing_submit", "element": f"form[{fi}]", "detail": "Form has no submit button"})
            except Exception:
                pass
            page.form_issues = quick_issues

        # Extract and verify links
        page.detected_links = self._extract_links()
        page.broken_links = self._check_broken_anchors()

        # Screenshot
        self._take_screenshot(page)

        # Collect errors/warnings
        for ce in page.console_entries:
            if ce["level"] in ("SEVERE", "ERROR"):
                page.errors.append(f"[Console {ce['level']}] {truncate(ce['message'])}")
            elif ce["level"] in ("WARNING", "WARN"):
                page.warnings.append(f"[Console {ce['level']}] {truncate(ce['message'])}")

    def _capture_performance(self, page: PageRecord):
        """Capture performance metrics using CDP."""
        try:
            metrics = self.driver.execute_cdp_cmd("Performance.getMetrics", {})
            metrics_map = {m["name"]: m["value"] for m in metrics.get("metrics", [])}

            # Calculate meaningful timings
            page.load_time_ms = metrics_map.get("LoadEventEnd", 0) - metrics_map.get("navigationStart", 0)
            page.dom_content_ms = metrics_map.get("DomContentLoaded", 0) - metrics_map.get("navigationStart", 0)

            # LCP approximation using Performance API
            try:
                lcp = self.driver.execute_script("""
                    return new Promise((resolve) => {
                        new PerformanceObserver((list) => {
                            const entries = list.getEntries();
                            resolve(entries.length > 0 ? entries[entries.length-1].startTime : 0);
                        }).observe({type: 'largest-contentful-paint', buffered: true});
                        setTimeout(() => resolve(0), 1000);
                    });
                """)
                if lcp:
                    page.lcp_ms = float(lcp)
            except Exception:
                pass

            # CLS
            try:
                cls = self.driver.execute_script("""
                    return new Promise((resolve) => {
                        let cls = 0;
                        new PerformanceObserver((list) => {
                            for (const entry of list.getEntries()) {
                                if (!entry.hadRecentInput) cls += entry.value;
                            }
                        }).observe({type: 'layout-shift', buffered: true});
                        setTimeout(() => resolve(cls), 500);
                    });
                """)
                if cls:
                    page.cls_score = float(cls)
            except Exception:
                pass

            # TTI approximation
            try:
                tti = self.driver.execute_script("""
                    return performance.timing ? (performance.timing.domInteractive - performance.timing.navigationStart) : 0;
                """)
                if tti and tti > 0:
                    page.tti_ms = float(tti)
            except Exception:
                pass

        except Exception as e:
            log.debug(f"Performance capture failed: {e}")

    def _analyze_network(self) -> list:
        """Analyze network requests for errors."""
        issues = []
        try:
            perf_logs = self._collect_performance_logs()
            for msg in perf_logs:
                try:
                    method = msg.get("message", {}).get("method", "")
                    params = msg.get("message", {}).get("params", {})

                    if "response" in params:
                        resp = params["response"]
                        url2 = resp.get("url", "")
                        status = resp.get("status", 0)
                        duration = params.get("responseReceivedTime", 0) * 1000 - params.get("requestTime", 0) * 1000

                        if status >= 400:
                            issues.append({
                                "url": url2,
                                "status": status,
                                "type": "client_error" if status < 500 else "server_error",
                                "duration_ms": round(duration, 2),
                                "detail": resp.get("statusText", "")
                            })
                        elif duration > SLOW_REQUEST_THRESHOLD_MS:
                            issues.append({
                                "url": url2,
                                "status": status,
                                "type": "slow_request",
                                "duration_ms": round(duration, 2),
                                "detail": f"Request took {duration:.0f}ms"
                            })

                    # Failed requests
                    if method == "Network.loadingFailed":
                        issues.append({
                            "url": params.get("requestId", ""),
                            "status": 0,
                            "type": "failed",
                            "duration_ms": 0,
                            "detail": f"{params.get('errorText', 'unknown')} - type: {params.get('type', '')}"
                        })

                    # CORS issues
                    if method == "Network.requestServedFromCache":
                        pass  # Not an issue

                except Exception:
                    pass
        except Exception as e:
            log.debug(f"Network analysis error: {e}")
        return issues

    def _check_ui(self) -> list:
        """Check for UI/rendering issues - consolidated JS execution."""
        issues = []
        try:
            # Run all checks in a single JS execution for speed
            results = self.driver.execute_script("""
                const issues = [];
                // 1. Missing images
                document.querySelectorAll('img').forEach(img => {
                    if (img.naturalWidth === 0 || img.naturalHeight === 0) {
                        issues.push({type: 'missing_image', detail: 'Image has 0 dimensions: ' + (img.src || '').slice(0, 100)});
                    }
                });
                // 2. Viewport overflow
                if (document.documentElement.scrollWidth > window.innerWidth) {
                    issues.push({type: 'horizontal_overflow', detail: 'Doc width ' + document.documentElement.scrollWidth + 'px > viewport ' + window.innerWidth + 'px'});
                }
                // 3. SVG issues
                document.querySelectorAll('svg').forEach(svg => {
                    try {
                        const bbox = svg.getBBox();
                        if (bbox.width === 0 || bbox.height === 0) {
                            issues.push({type: 'broken_icon', detail: 'SVG with zero dimensions'});
                        }
                    } catch(e) {}
                });
                return JSON.stringify(issues);
            """)
            if results:
                parsed = json.loads(results)
                for item in parsed:
                    item["element"] = "page"
                    issues.append(item)
        except Exception as e:
            log.debug(f"UI check error: {e}")
        return issues

    def _check_accessibility(self) -> list:
        """Check for basic a11y issues - consolidated JS."""
        issues = []
        try:
            results = self.driver.execute_script("""
                const issues = [];
                // 1. Missing alt on images
                document.querySelectorAll('img:not([alt])').forEach(img => {
                    issues.push({type: 'missing_alt', wcag: '1.1.1', detail: 'Image missing alt: ' + (img.src || '').slice(0, 80)});
                });
                // 2. Missing labels on inputs
                document.querySelectorAll('input:not([type=\"hidden\"]):not([type=\"submit\"]):not([type=\"button\"]):not([type=\"image\"])').forEach(inp => {
                    const id = inp.id;
                    if (!id || !document.querySelector('label[for=\"' + id + '\"]')) {
                        const parent = inp.parentElement;
                        if (!parent || !parent.querySelector('label')) {
                            if (!inp.getAttribute('aria-label')) {
                                issues.push({type: 'missing_label', wcag: '1.3.1', detail: 'Input missing label: name=' + (inp.name || id || 'unnamed')});
                            }
                        }
                    }
                });
                // 3. Landmarks
                if (!document.querySelector('main, [role=\"main\"]')) {
                    issues.push({type: 'missing_landmark', wcag: '1.3.6', detail: 'No <main> or role=\"main\" landmark'});
                }
                // 4. Contrast warning (basic check)
                const textEls = document.querySelectorAll('p, span, a, h1, h2, h3, h4, h5, h6, label, button');
                let contrastCount = 0;
                for (const el of textEls) {
                    const style = window.getComputedStyle(el);
                    const bg = style.backgroundColor;
                    if (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') continue;
                    if (el.textContent.trim().length < 5) continue;
                    contrastCount++;
                    if (contrastCount > 3) break;
                }
                if (contrastCount > 0) {
                    issues.push({type: 'contrast_warning', wcag: '1.4.3', detail: 'Found ' + contrastCount + ' elements with potential contrast issues'});
                }
                return JSON.stringify(issues);
            """)
            if results:
                for item in json.loads(results):
                    item["element"] = "page"
                    issues.append(item)
        except Exception as e:
            log.debug(f"A11y check error: {e}")
        return issues

    def _check_seo(self) -> list:
        """Check for SEO issues - consolidated JS."""
        issues = []
        try:
            results = self.driver.execute_script("""
                const issues = [];
                const title = document.title;
                if (!title) issues.push({type: 'missing_title', detail: 'No <title>'});
                else if (title.length > 60) issues.push({type: 'title_too_long', detail: 'Title ' + title.length + ' chars: ' + title.slice(0,60)});
                else if (title.length < 10) issues.push({type: 'title_too_short', detail: 'Title only ' + title.length + ' chars'});

                const metaDesc = document.querySelector('meta[name=\"description\"]');
                if (!metaDesc) issues.push({type: 'missing_meta_description', detail: 'No meta description'});
                else if ((metaDesc.content || '').length > 160) issues.push({type: 'meta_desc_too_long', detail: 'Meta desc ' + metaDesc.content.length + ' chars'});

                if (!document.querySelector('link[rel=\"canonical\"]')) issues.push({type: 'missing_canonical', detail: 'No canonical tag'});

                const ogTags = document.querySelectorAll('meta[property^=\"og:\"]');
                if (ogTags.length === 0) issues.push({type: 'missing_og_tags', detail: 'No Open Graph tags'});

                const h1s = document.querySelectorAll('h1');
                if (h1s.length === 0) issues.push({type: 'missing_h1', detail: 'No H1 heading'});
                else if (h1s.length > 1) issues.push({type: 'multiple_h1', detail: h1s.length + ' H1 headings found'});

                const headings = document.querySelectorAll('h1,h2,h3,h4,h5,h6');
                let lastLevel = 0;
                for (const h of headings) {
                    const level = parseInt(h.tagName[1]);
                    if (lastLevel > 0 && level - lastLevel > 1) {
                        issues.push({type: 'heading_skip', detail: 'Skip from H' + lastLevel + ' to H' + level + ': ' + (h.textContent || '').trim().slice(0, 50)});
                        break;
                    }
                    lastLevel = level;
                }

                const robots = document.querySelector('meta[name=\"robots\"]');
                if (robots && robots.content && robots.content.includes('noindex')) {
                    issues.push({type: 'noindex', detail: 'noindex: ' + robots.content});
                }

                return JSON.stringify(issues);
            """)
            if results:
                for item in json.loads(results):
                    item["element"] = "page"
                    issues.append(item)
        except Exception as e:
            log.debug(f"SEO check error: {e}")
        return issues

    def _check_forms(self) -> list:
        """Test forms on the page."""
        issues = []
        try:
            forms = self.driver.find_elements(By.TAG_NAME, "form")
            for i, form in enumerate(forms):
                try:
                    inputs = form.find_elements(By.CSS_SELECTOR, "input, select, textarea")
                    submit_btns = form.find_elements(By.CSS_SELECTOR, "button[type='submit'], input[type='submit']")

                    if not submit_btns:
                        issues.append({
                            "type": "missing_submit",
                            "element": f"form[{i}]",
                            "detail": "Form has no submit button"
                        })

                    # Check required inputs have proper attributes
                    for inp in inputs:
                        try:
                            required = inp.get_attribute("required")
                            input_type = inp.get_attribute("type") or "text"
                            if not required and input_type not in ("hidden", "submit", "button", "image"):
                                pass  # Not all inputs need to be required
                        except Exception:
                            pass

                    # Test with empty submit (but only if safe - not on login forms)
                    is_login = bool(form.find_elements(By.CSS_SELECTOR, "input[type='password']"))
                    if not is_login and submit_btns:
                        try:
                            submit_btns[0].click()
                            time.sleep(0.5)
                            # Check for validation messages
                            validation_msgs = self.driver.find_elements(By.CSS_SELECTOR, "[class*='error'], [class*='validation'], [role='alert'], .text-red-*, .text-error")
                            if validation_msgs:
                                for vmsg in validation_msgs:
                                    text = vmsg.text.strip()
                                    if text:
                                        issues.append({
                                            "type": "validation_message",
                                            "element": f"form[{i}]",
                                            "detail": f"Empty submit validation: {truncate(text, 100)}"
                                        })
                        except Exception:
                            pass

                except Exception:
                    pass
        except Exception as e:
            log.debug(f"Form check error: {e}")
        return issues

    def _extract_links(self) -> list:
        """Extract all links from the page, including JS-rendered ones."""
        links = []
        try:
            # Use JS to get all links (including SPA-rendered ones)
            all_links = self.driver.execute_script("""
                return Array.from(document.querySelectorAll('a[href]')).map(a => ({
                    href: a.href,
                    text: (a.textContent || a.getAttribute('aria-label') || '').trim().slice(0, 50)
                }));
            """)
            if all_links:
                for link in all_links:
                    if link["href"] and not link["href"].startswith("javascript:"):
                        links.append(link)
            else:
                # Fallback to Selenium find_elements
                for a in self.driver.find_elements(By.TAG_NAME, "a"):
                    try:
                        href = a.get_attribute("href")
                        if href:
                            text = a.text.strip()[:50] or (a.get_attribute("aria-label") or "")[:50]
                            links.append({"href": href, "text": text or "(no text)"})
                    except Exception:
                        pass
        except Exception:
            pass
        return links

    def _check_broken_anchors(self) -> list:
        """Check for broken anchor links (same-page)."""
        issues = []
        try:
            anchors = self.driver.find_elements(By.TAG_NAME, "a")
            for a in anchors:
                try:
                    href = a.get_attribute("href") or ""
                    if "#" in href:
                        fragment = href.split("#")[1]
                        if fragment:
                            target_id = None
                            try:
                                target_id = self.driver.find_element(By.ID, fragment)
                            except NoSuchElementException:
                                try:
                                    target_id = self.driver.find_element(By.NAME, fragment)
                                except NoSuchElementException:
                                    pass
                            if target_id is None:
                                issues.append({
                                    "href": href,
                                    "text": a.text.strip()[:50] or "(no text)",
                                    "type": "broken_anchor",
                                    "detail": f"Anchor '#{fragment}' not found on page"
                                })
                except Exception:
                    pass
        except Exception:
            pass
        return issues

    def _take_screenshot(self, page: PageRecord):
        """Take a screenshot of the page."""
        try:
            filename = f"{self.session_id}_{len(self.visited):03d}.png"
            filepath = os.path.join(SCREENSHOT_DIR, filename)
            self.driver.save_screenshot(filepath)
            page.screenshot_file = filename
        except Exception as e:
            log.debug(f"Screenshot error: {e}")

    def _discover_links(self) -> list:
        """Discover all internal links on the current page that haven't been visited."""
        new_urls = []
        try:
            all_links = self.driver.find_elements(By.TAG_NAME, "a")
            for link in all_links:
                try:
                    href = link.get_attribute("href")
                    if not href or href.startswith("javascript:") or href.startswith("tel:") or href.startswith("mailto:"):
                        continue
                    absolute = urljoin(self.driver.current_url, href)
                    if is_internal(absolute):
                        normalized = normalize_url(absolute)
                        if normalized not in self.discovered and normalized not in self.visited and not self._is_static_asset(normalized):
                            new_urls.append(normalized)
                            self.discovered.add(normalized)
                except Exception:
                    pass

            # Also try to find links in JS-rendered content, hidden elements
            try:
                more_links = self.driver.execute_script("""
                    const links = document.querySelectorAll('a[href]');
                    return Array.from(links).map(a => a.href).filter(h => h && !h.startsWith('javascript:'));
                """)
                for href in more_links:
                    if is_internal(href):
                        normalized = normalize_url(href)
                        if normalized not in self.discovered and normalized not in self.visited and not self._is_static_asset(normalized):
                            self.discovered.add(normalized)
                            new_urls.append(normalized)
            except Exception:
                pass

        except Exception as e:
            log.debug(f"Link discovery error: {e}")
        return new_urls

    def _is_static_asset(self, url: str) -> bool:
        return bool(re.search(r'\.(css|js|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot|json|xml|webp|avif)$', url, re.I))

    def _click_interactive_elements(self, page: PageRecord):
        """Click on interactive elements to discover more routes and check functionality."""
        selectors = [
            "[role='tab']:not([aria-selected='true'])",
            "[data-state='closed'] button",
            "button:not([disabled])",
        ]
        for selector in selectors:
            try:
                for el in self.driver.find_elements(By.CSS_SELECTOR, selector)[:2]:
                    try:
                        if el.is_displayed() and el.is_enabled():
                            self.driver.execute_script("arguments[0].click()", el)
                            time.sleep(0.3)
                    except Exception:
                        pass
            except Exception:
                pass

        # Quick scroll for lazy content
        self.driver.execute_script("window.scrollBy(0, 500)")
        time.sleep(0.3)
        self._discover_links()

    def run(self):
        """Main crawl execution."""
        try:
            self.setup_driver()

            # Add initial pages to visit (public routes)
            initial_routes = [
                "/login", "/signup", "/admin/login", "/admin/signup", "/verify-email", "/staff",
            ]
            for route in initial_routes:
                url = f"{BASE_URL}{route}"
                if url not in self.discovered:
                    self.discovered.add(url)
                    self.to_visit.append((url, 0))

            # Add root
            root_url = f"{BASE_URL}/"
            if root_url not in self.discovered:
                self.discovered.add(root_url)
                self.to_visit.append((root_url, 0))

            # Try to login first
            login_success = self.login()
            self._init_console_hooks()
            if login_success:
                log.info("Login successful - will also crawl protected routes")

                # Add protected routes to discover set
                protected_routes = [
                    "/dashboard", "/pos", "/orders", "/orders/new", "/kitchen",
                    "/menu", "/inventory", "/billing", "/motel", "/reports",
                    "/settings", "/audit", "/analytics", "/system-health", "/tables",
                    "/admin/users", "/admin/activity", "/admin/features", "/admin/queue",
                    "/admin",
                ]
                for route in protected_routes:
                    url = f"{BASE_URL}{route}"
                    if url not in self.discovered:
                        self.discovered.add(url)
                        self.to_visit.append((url, 1))  # depth 1 for protected routes
            else:
                log.info("Login not performed/skipped - crawling public routes only")

            # Main crawl loop
            while self.to_visit and len(self.visited) < MAX_PAGES:
                url, depth = self.to_visit.pop(0)
                if url in self.visited:
                    continue
                if depth > MAX_DEPTH:
                    continue

                normalized_url = normalize_url(url)
                if normalized_url in self.visited:
                    continue

                log.info(f"[{len(self.visited)+1}/{len(self.discovered)}] Crawling: {normalized_url} (depth={depth})")
                page = PageRecord(url=normalized_url, depth=depth)
                self.visited.add(normalized_url)

                try:
                    start = time.time()
                    self.driver.get(normalized_url)
                    self._wait_for_page()
                    load_duration = (time.time() - start) * 1000

                    if page.load_time_ms == 0:
                        page.load_time_ms = load_duration

                    # Scroll to trigger lazy loading
                    self._scroll_whole_page()

                    # Run analysis
                    self._analyze_page(normalized_url, page)

                    # Click interactive elements to discover more
                    self._click_interactive_elements(page)

                    # Ensure we go back to the original page for analysis
                    current_url = normalize_url(self.driver.current_url)
                    if current_url != normalized_url:
                        log.info(f"  Navigated to {current_url} during interaction - visiting it")
                        if current_url not in self.visited:
                            self.to_visit.append((current_url, depth + 1))

                    page.status = "ok"
                    log.info(f"  Page OK - {len(page.errors)} errors, {len(page.ui_issues)} UI, {len(page.a11y_issues)} a11y, {len(page.seo_issues)} SEO")

                except WebDriverException as e:
                    page.status = "error"
                    page.errors.append(f"WebDriver error: {str(e)[:200]}")
                    log.warning(f"  Error crawling {normalized_url}: {e}")

                except Exception as e:
                    page.status = "error"
                    page.errors.append(f"Crawl error: {str(e)[:200]}")
                    log.warning(f"  Error crawling {normalized_url}: {e}")

                # Discover new links from this page
                new_links = self._discover_links()
                for link in new_links:
                    if link not in self.visited:
                        self.to_visit.append((link, depth + 1))

                self.report.pages.append(page)

                # Periodically save partial results
                if len(self.visited) % 5 == 0:
                    with open(os.path.join(REPORT_DIR, "partial_report.json"), "w") as f:
                        json.dump({"visited": len(self.visited), "discovered": len(self.discovered),
                                   "pages_ok": len([p for p in self.report.pages if p.status == "ok"])}, f)

                time.sleep(0.2)

            self.report.end_time = datetime.now(timezone.utc).isoformat()
            log.info(f"Crawl complete. Visited {len(self.visited)} pages, discovered {len(self.discovered)} total.")

        except Exception as e:
            log.error(f"Crawl failed: {e}")
            self.report.end_time = datetime.now(timezone.utc).isoformat()

        finally:
            if self.driver:
                try:
                    # Flush browser logs (call once at end to avoid slow per-page calls)
                    all_browser_logs = self._flush_browser_logs()
                    log.info(f"Flushed {len(all_browser_logs)} browser log entries")

                    # Tag each console entry with its page context
                    # (we can't perfectly attribute, but merge into the last page)
                    if all_browser_logs and self.report.pages:
                        last_page = self.report.pages[-1]
                        for entry in all_browser_logs:
                            last_page.console_entries.append({
                                "level": entry.get("level", ""),
                                "message": entry.get("message", ""),
                                "timestamp": entry.get("timestamp", 0),
                                "source": entry.get("source", "")
                            })

                    self.driver.quit()
                except Exception as e:
                    log.debug(f"Cleanup error: {e}")

        self._finalize_report()
        return self.report

    def _finalize_report(self):
        """Compile final report metrics."""
        r = self.report
        r.total_pages_discovered = len(self.discovered)
        r.total_pages_crawled = len([p for p in r.pages if p.status == "ok"])
        r.failed_pages = len([p for p in r.pages if p.status != "ok"])
        r.total_broken_links = sum(len(p.broken_links) for p in r.pages)
        r.total_console_errors = sum(len([e for e in p.console_entries if e["level"] in ("SEVERE", "ERROR")]) for p in r.pages)
        r.total_network_failures = sum(len(p.network_issues) for p in r.pages)
        r.total_ui_issues = sum(len(p.ui_issues) for p in r.pages)
        r.total_a11y_issues = sum(len(p.a11y_issues) for p in r.pages)
        r.total_seo_issues = sum(len(p.seo_issues) for p in r.pages)
        r.total_form_issues = sum(len(p.form_issues) for p in r.pages)

        load_times = [p.load_time_ms for p in r.pages if p.load_time_ms > 0]
        r.avg_load_time_ms = sum(load_times) / len(load_times) if load_times else 0

        # Compile severe issues
        all_issues = []
        for p in r.pages:
            url = p.url
            for e in p.errors:
                all_issues.append({"type": "error", "severity": "Critical", "page": url, "detail": e})
            for e in p.network_issues:
                sev = "Critical" if e["status"] >= 500 else "High" if e["status"] >= 400 else "Medium"
                all_issues.append({"type": "network", "severity": sev, "page": url, "detail": f"{e['type']}: {e['url']} ({e['status']})"})
            for e in p.broken_links:
                all_issues.append({"type": "broken_link", "severity": "High", "page": url, "detail": f"Broken anchor: {e['href']}"})
            for e in p.ui_issues:
                sev = "High" if e["type"] in ("missing_image", "layout_shift") else "Medium"
                all_issues.append({"type": "ui", "severity": sev, "page": url, "detail": f"{e['type']}: {e['detail']}"})
            for e in p.a11y_issues:
                all_issues.append({"type": "a11y", "severity": "Medium", "page": url, "detail": f"{e['type']}: {e['detail']}"})
            for e in p.seo_issues:
                all_issues.append({"type": "seo", "severity": "Low", "page": url, "detail": f"{e['type']}: {e['detail']}"})
            for e in p.form_issues:
                all_issues.append({"type": "form", "severity": "Medium", "page": url, "detail": f"{e['type']}: {e['detail']}"})

        # Sort severe issues
        severity_order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
        all_issues.sort(key=lambda x: (severity_order.get(x["severity"], 99), x["page"]))
        r.severe_issues = all_issues[:100]  # Top 100


# ── Report Generation ───────────────────────────────────────────────────────
def generate_json_report(report: AuditReport):
    """Generate JSON report."""
    filepath = os.path.join(REPORT_DIR, "qa_audit_report.json")
    with open(filepath, "w", encoding="utf-8") as f:
        # Convert pages to serializable format
        data = asdict(report)
        json.dump(data, f, indent=2, default=str)
    log.info(f"JSON report saved to {filepath}")
    return filepath

def generate_html_report(report: AuditReport):
    """Generate human-readable HTML report."""
    filepath = os.path.join(REPORT_DIR, "qa_audit_report.html")

    sev_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for issue in report.severe_issues:
        if issue["severity"] in sev_counts:
            sev_counts[issue["severity"]] += 1

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>QA Audit Report - Highlands Cafe & Motel Inn</title>
<style>
:root {{ --bg: #0f172a; --surface: #1e293b; --border: #334155; --text: #e2e8f0; --text-secondary: #94a3b8; --critical: #ef4444; --high: #f97316; --medium: #eab308; --low: #22c55e; }}
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); line-height: 1.6; padding: 2rem; }}
.container {{ max-width: 1400px; margin: 0 auto; }}
h1 {{ font-size: 2rem; margin-bottom: 0.5rem; }}
h2 {{ font-size: 1.5rem; margin: 2rem 0 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border); }}
h3 {{ font-size: 1.2rem; margin: 1.5rem 0 0.5rem; }}
.summary-cards {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin: 1.5rem 0; }}
.card {{ background: var(--surface); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.25rem; }}
.card .label {{ font-size: 0.8rem; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.05em; }}
.card .value {{ font-size: 2rem; font-weight: 700; margin: 0.25rem 0; }}
.card .value.critical {{ color: var(--critical); }} .card .value.high {{ color: var(--high); }} .card .value.medium {{ color: var(--medium); }} .card .value.low {{ color: var(--low); }}
.severity-badge {{ display: inline-block; padding: 0.2rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }}
.severity-badge.Critical {{ background: rgba(239,68,68,0.2); color: var(--critical); }}
.severity-badge.High {{ background: rgba(249,115,22,0.2); color: var(--high); }}
.severity-badge.Medium {{ background: rgba(234,179,8,0.2); color: var(--medium); }}
.severity-badge.Low {{ background: rgba(34,197,94,0.2); color: var(--low); }}
.issue {{ background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 1rem; margin-bottom: 0.5rem; display: flex; align-items: flex-start; gap: 1rem; }}
.issue .type {{ font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; min-width: 70px; }}
.issue .detail {{ flex: 1; }}
.issue .page-url {{ font-size: 0.8rem; color: var(--text-secondary); word-break: break-all; }}
.page-list {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 0.75rem; }}
.page-item {{ background: var(--surface); border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.75rem; font-size: 0.9rem; }}
.page-item .url {{ word-break: break-all; }}
.page-item .title {{ color: var(--text-secondary); font-size: 0.8rem; }}
.page-item .ok {{ color: var(--low); }} .page-item .error {{ color: var(--critical); }}
.page-item .meta {{ display: flex; gap: 0.5rem; margin-top: 0.3rem; flex-wrap: wrap; }}
.page-item .meta span {{ font-size: 0.75rem; padding: 0.1rem 0.4rem; background: rgba(255,255,255,0.05); border-radius: 4px; }}
table {{ width: 100%; border-collapse: collapse; margin: 1rem 0; }}
th, td {{ text-align: left; padding: 0.75rem; border-bottom: 1px solid var(--border); }}
th {{ font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); }}
tr:hover td {{ background: rgba(255,255,255,0.02); }}
.filter-bar {{ display: flex; gap: 0.5rem; margin: 1rem 0; flex-wrap: wrap; }}
.filter-bar button {{ padding: 0.4rem 1rem; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font-size: 0.85rem; }}
.filter-bar button.active {{ background: var(--critical); color: white; border-color: var(--critical); }}
.percentile {{ display: inline-block; width: 60px; height: 6px; background: var(--border); border-radius: 3px; margin-left: 0.5rem; vertical-align: middle; }}
.percentile .fill {{ height: 100%; border-radius: 3px; }}
@media (max-width: 768px) {{ body {{ padding: 1rem; }} }}
</style>
</head>
<body>
<div class="container">
<h1>🛡 QA Audit Report</h1>
<p style="color: var(--text-secondary);">Highlands Cafe & Motel Inn | <strong>Base URL:</strong> {report.base_url} | <strong>Session:</strong> {report.start_time.split('T')[0]}</p>

<h2>Summary</h2>
<div class="summary-cards">
    <div class="card"><div class="label">Pages Discovered</div><div class="value">{report.total_pages_discovered}</div></div>
    <div class="card"><div class="label">Pages Crawled</div><div class="value">{report.total_pages_crawled}</div></div>
    <div class="card"><div class="label">Failed Pages</div><div class="value" style="color: var(--critical)">{report.failed_pages}</div></div>
    <div class="card"><div class="label">Avg Load Time</div><div class="value">{report.avg_load_time_ms:.0f}ms</div></div>
</div>

<div class="summary-cards">
    <div class="card"><div class="label">Console Errors</div><div class="value critical">{report.total_console_errors}</div></div>
    <div class="card"><div class="label">Network Failures</div><div class="value high">{report.total_network_failures}</div></div>
    <div class="card"><div class="label">Broken Links</div><div class="value high">{report.total_broken_links}</div></div>
    <div class="card"><div class="label">UI Issues</div><div class="value medium">{report.total_ui_issues}</div></div>
    <div class="card"><div class="label">A11y Issues</div><div class="value medium">{report.total_a11y_issues}</div></div>
    <div class="card"><div class="label">SEO Issues</div><div class="value low">{report.total_seo_issues}</div></div>
    <div class="card"><div class="label">Form Issues</div><div class="value medium">{report.total_form_issues}</div></div>
</div>

<h2>Issue Severity Breakdown</h2>
<div class="summary-cards">
    <div class="card"><div class="label">Critical</div><div class="value critical">{sev_counts["Critical"]}</div></div>
    <div class="card"><div class="label">High</div><div class="value high">{sev_counts["High"]}</div></div>
    <div class="card"><div class="label">Medium</div><div class="value medium">{sev_counts["Medium"]}</div></div>
    <div class="card"><div class="label">Low</div><div class="value low">{sev_counts["Low"]}</div></div>
</div>

<h2>Performance Metrics</h2>
<table>
<tr><th>Metric</th><th>Avg</th><th>Min</th><th>Max</th></tr>
"""
    load_times = [p.load_time_ms for p in report.pages if p.load_time_ms > 0]
    dom_times = [p.dom_content_ms for p in report.pages if p.dom_content_ms > 0]
    lcp_times = [p.lcp_ms for p in report.pages if p.lcp_ms > 0]
    cls_scores = [p.cls_score for p in report.pages if p.cls_score > 0]

    def fmt(v): return f"{v:.1f}ms" if v > 0 else "N/A"
    perf_rows = [
        ("Page Load Time", fmt(sum(load_times)/len(load_times)) if load_times else "N/A",
         fmt(min(load_times)) if load_times else "N/A", fmt(max(load_times)) if load_times else "N/A"),
        ("DOM Content", fmt(sum(dom_times)/len(dom_times)) if dom_times else "N/A",
         fmt(min(dom_times)) if dom_times else "N/A", fmt(max(dom_times)) if dom_times else "N/A"),
        ("LCP", fmt(sum(lcp_times)/len(lcp_times)) if lcp_times else "N/A",
         fmt(min(lcp_times)) if lcp_times else "N/A", fmt(max(lcp_times)) if lcp_times else "N/A"),
        ("CLS", f"{sum(cls_scores)/len(cls_scores):.3f}" if cls_scores else "N/A",
         f"{min(cls_scores):.3f}" if cls_scores else "N/A", f"{max(cls_scores):.3f}" if cls_scores else "N/A"),
    ]
    for row in perf_rows:
        html += f"<tr><td>{row[0]}</td><td>{row[1]}</td><td>{row[2]}</td><td>{row[3]}</td></tr>\n"

    html += """</table>

<h2>All Issues (by severity)</h2>
"""
    # Issues by severity
    for sev in ["Critical", "High", "Medium", "Low"]:
        sev_issues = [i for i in report.severe_issues if i["severity"] == sev]
        if sev_issues:
            color = {"Critical": "critical", "High": "high", "Medium": "medium", "Low": "low"}[sev]
            html += f'<h3 style="color: var(--{color})">{sev} ({len(sev_issues)})</h3>\n'
            for issue in sev_issues[:30]:
                html += f"""<div class="issue">
    <span class="severity-badge {issue['severity']}">{issue['severity']}</span>
    <span class="type">{issue['type']}</span>
    <div class="detail">{issue['detail']}</div>
    <div class="page-url">{issue['page']}</div>
</div>
"""
            if len(sev_issues) > 30:
                html += f'<p style="color: var(--text-secondary);">... and {len(sev_issues)-30} more {sev.lower()} issues</p>\n'

    html += """
<h2>All Crawled Pages</h2>
<div class="page-list">
"""
    for p in report.pages:
        errors = len(p.errors)
        warnings = len(p.warnings)
        ui = len(p.ui_issues)
        a11y = len(p.a11y_issues)
        seo = len(p.seo_issues)
        has_screenshot = bool(p.screenshot_file)
        html += f"""<div class="page-item">
    <div class="url"><strong>{'/' + '/'.join(p.url.split('/')[3:]) if p.url.startswith('http') else p.url}</strong></div>
    <div class="title">{p.title}</div>
    <div class="meta">
        <span class="{'ok' if p.status == 'ok' else 'error'}">{p.status}</span>
        <span>{p.load_time_ms:.0f}ms</span>
        <span>{errors} errors</span>
        <span>{ui} UI</span>
        <span>{a11y} a11y</span>
        <span>{seo} SEO</span>
        {"<span>📸</span>" if has_screenshot else ""}
    </div>
</div>
"""
    html += """</div>

<h2>Pages With Most Issues</h2>
<table>
<tr><th>Page</th><th>Errors</th><th>Network</th><th>UI</th><th>A11y</th><th>SEO</th><th>Load</th></tr>
"""
    sorted_pages = sorted(report.pages, key=lambda p: len(p.errors) + len(p.network_issues), reverse=True)[:20]
    for p in sorted_pages:
        html += f"<tr><td>{p.url.split('/')[-1] or '/'}</td><td>{len(p.errors)}</td><td>{len(p.network_issues)}</td><td>{len(p.ui_issues)}</td><td>{len(p.a11y_issues)}</td><td>{len(p.seo_issues)}</td><td>{p.load_time_ms:.0f}ms</td></tr>\n"
    html += """</table>

<p style="margin-top: 3rem; color: var(--text-secondary); font-size: 0.85rem;">
Generated by Automated QA Audit System | Highlands Cafe & Motel Inn | {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}
</p>
</div>
</body>
</html>"""
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(html)
    log.info(f"HTML report saved to {filepath}")
    return filepath


def generate_console_report(report: AuditReport):
    """Generate console log report."""
    filepath = os.path.join(REPORT_DIR, "console_log_report.txt")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("=" * 80 + "\n")
        f.write("CONSOLE LOG REPORT - Highlands Cafe & Motel Inn\n")
        f.write("=" * 80 + "\n\n")
        for p in report.pages:
            severe = [e for e in p.console_entries if e["level"] in ("SEVERE", "ERROR")]
            warnings = [e for e in p.console_entries if e["level"] in ("WARNING", "WARN")]
            if severe or warnings:
                f.write(f"\n--- {p.url} ---\n")
                for e in severe:
                    f.write(f"  [ERROR] {e.get('message', '')[:300]}\n")
                for e in warnings:
                    f.write(f"  [WARN]  {e.get('message', '')[:300]}\n")
        f.write("\n\n=== END OF CONSOLE REPORT ===\n")
    log.info(f"Console report saved to {filepath}")

def generate_network_report(report: AuditReport):
    """Generate network error report."""
    filepath = os.path.join(REPORT_DIR, "network_error_report.txt")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("=" * 80 + "\n")
        f.write("NETWORK ERROR REPORT - Highlands Cafe & Motel Inn\n")
        f.write("=" * 80 + "\n\n")
        for p in report.pages:
            if p.network_issues:
                f.write(f"\n--- {p.url} ---\n")
                for ni in p.network_issues:
                    f.write(f"  [{ni['status']}] {ni['type']}: {ni.get('url', '')[:200]}")
                    if ni.get('duration_ms', 0) > 0:
                        f.write(f" ({ni['duration_ms']:.0f}ms)")
                    if ni.get('detail'):
                        f.write(f" - {ni['detail']}")
                    f.write("\n")
        f.write("\n\n=== END OF NETWORK REPORT ===\n")
    log.info(f"Network report saved to {filepath}")

def generate_url_list(report: AuditReport):
    """Generate list of all discovered URLs."""
    filepath = os.path.join(REPORT_DIR, "all_urls.txt")
    with open(filepath, "w", encoding="utf-8") as f:
        f.write("ALL DISCOVERED URLS\n")
        f.write("=" * 80 + "\n\n")
        for p in report.pages:
            status_icon = "✓" if p.status == "ok" else "✗"
            f.write(f"{status_icon} {p.url} ({p.status})\n")
    log.info(f"URL list saved to {filepath}")

def generate_summary(report: AuditReport):
    """Generate print-friendly summary."""
    filepath = os.path.join(REPORT_DIR, "summary.md")
    sev_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for issue in report.severe_issues:
        if issue["severity"] in sev_counts:
            sev_counts[issue["severity"]] += 1

    summary = f"""# QA Audit Summary

**Base URL:** {report.base_url}
**Date:** {report.start_time.split('T')[0]}
**Duration:** {report.end_time} - {report.start_time}

## Overview
- **Pages Discovered:** {report.total_pages_discovered}
- **Pages Crawled:** {report.total_pages_crawled}
- **Failed Pages:** {report.failed_pages}
- **Average Load Time:** {report.avg_load_time_ms:.0f}ms

## Issues Found
| Severity | Count |
|----------|-------|
| Critical | {sev_counts["Critical"]} |
| High     | {sev_counts["High"]} |
| Medium   | {sev_counts["Medium"]} |
| Low      | {sev_counts["Low"]} |

| Category | Count |
|----------|-------|
| Console Errors | {report.total_console_errors} |
| Network Failures | {report.total_network_failures} |
| Broken Links | {report.total_broken_links} |
| UI Issues | {report.total_ui_issues} |
| Accessibility Issues | {report.total_a11y_issues} |
| SEO Issues | {report.total_seo_issues} |
| Form Issues | {report.total_form_issues} |

## Top Recommendations
"""
    critical = [i for i in report.severe_issues if i["severity"] == "Critical"]
    high = [i for i in report.severe_issues if i["severity"] == "High"]

    if critical:
        summary += "\n### Critical\n"
        for i in critical[:10]:
            summary += f"- [{i['type']}] {i['detail']} (__{i['page']}__)\n"
    if high:
        summary += "\n### High\n"
        for i in high[:15]:
            summary += f"- [{i['type']}] {i['detail']} (__{i['page']}__)\n"

    summary += f"\n\n_Report generated by Automated QA Audit System_"
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(summary)
    log.info(f"Summary saved to {filepath}")


# ── Main Execution ─────────────────────────────────────────────────────────
def main():
    log.info("=" * 60)
    log.info("Starting QA Audit Crawl")
    log.info(f"Base URL: {BASE_URL}")
    log.info(f"Report dir: {REPORT_DIR}")
    log.info("=" * 60)

    crawler = QAAuditCrawler()
    report = crawler.run()

    log.info("\n" + "=" * 60)
    log.info("Generating reports...")

    json_path = generate_json_report(report)
    html_path = generate_html_report(report)
    generate_console_report(report)
    generate_network_report(report)
    generate_url_list(report)
    generate_summary(report)

    log.info(f"\nAll reports saved to {REPORT_DIR}")
    log.info(f"  - {json_path}")
    log.info(f"  - {html_path}")
    log.info("=" * 60)

    # Print summary to console
    print("\n" + "=" * 60)
    print("AUDIT COMPLETE - QUICK SUMMARY")
    print("=" * 60)
    print(f"  Pages discovered: {report.total_pages_discovered}")
    print(f"  Pages crawled:    {report.total_pages_crawled}")
    print(f"  Failed pages:     {report.failed_pages}")
    print(f"  Console errors:   {report.total_console_errors}")
    print(f"  Network failures: {report.total_network_failures}")
    print(f"  Broken links:     {report.total_broken_links}")
    print(f"  UI issues:        {report.total_ui_issues}")
    print(f"  A11y issues:      {report.total_a11y_issues}")
    print(f"  SEO issues:       {report.total_seo_issues}")
    print(f"  Form issues:      {report.total_form_issues}")
    print(f"  Avg load time:    {report.avg_load_time_ms:.0f}ms")
    print("=" * 60)

    return report


if __name__ == "__main__":
    main()

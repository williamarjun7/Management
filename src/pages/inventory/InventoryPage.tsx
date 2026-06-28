import { useState } from "react";
import { Plus, Package, AlertTriangle, TrendingDown, ClipboardList, Trash2, RefreshCw } from "lucide-react";
import { useProducts, useStockMovements, useDeleteProduct } from "../../lib/hooks";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { showSuccess, showError } from "../../components/ui/toast";
import { ProductForm } from "./ProductForm";
import { StockMovementForm } from "./StockMovementForm";
import type { Product, StockMovement } from "../../types";

export default function InventoryPage() {
  const [activeTab, setActiveTab] = useState("products");
  const [showProductForm, setShowProductForm] = useState(false);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: movements, isLoading: movementsLoading } = useStockMovements();
  const deleteProduct = useDeleteProduct();
  const [confirmDeleteProduct, setConfirmDeleteProduct] = useState<Product | null>(null);

  const lowStockProducts = products?.filter(
    (p: Product & { stock_balance: number }) =>
      p.reorder_level !== null && p.reorder_level !== undefined &&
      p.stock_balance <= Number(p.reorder_level)
  ) ?? [];

  const totalProducts = products?.length ?? 0;
  const lowStockCount = lowStockProducts.length;
  const totalStockValue = products?.reduce(
    (s: number, p: Product & { stock_balance: number }) => s + Number(p.stock_balance),
    0
  ) ?? 0;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory</h1>
          <p className="text-muted-foreground">Track stock levels and manage products.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => window.location.reload()} className="p-2 rounded-md hover:bg-muted transition-colors" aria-label="Refresh data">
            <RefreshCw className="h-4 w-4" />
          </button>
          <Button variant="outline" onClick={() => setShowMovementForm(true)} className="min-h-[44px]">
            <ClipboardList className="mr-2 h-4 w-4" /> Record Movement
          </Button>
          <Button onClick={() => setShowProductForm(true)} className="min-h-[44px]">
            <Plus className="mr-2 h-4 w-4" /> Add Product
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
            <AlertTriangle className={`h-4 w-4 ${lowStockCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${lowStockCount > 0 ? "text-destructive" : ""}`}>
              {lowStockCount}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stock Movements</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{movements?.length ?? 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Stock</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStockValue.toFixed(1)}</div>
          </CardContent>
        </Card>
      </div>

      {lowStockCount > 0 && (
        <Card className="border-destructive/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> Low Stock Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStockProducts.map((p: Product & { stock_balance: number }) => (
                <Badge key={p.id} variant="destructive" className="text-xs">
                  {p.name} ({p.stock_balance} {p.unit})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {activeTab === "products" && (
            <Card>
              <CardContent className="p-0">
                {productsLoading ? (
                  <div className="space-y-2 p-4">
                    {[1,2,3,4,5].map(i => (
                      <div key={i} className="flex gap-4 animate-pulse">
                        <div className="h-4 bg-muted rounded w-1/4" />
                        <div className="h-4 bg-muted rounded w-1/4" />
                        <div className="h-4 bg-muted rounded w-1/6" />
                        <div className="h-4 bg-muted rounded w-1/6" />
                      </div>
                    ))}
                  </div>
                ) : products?.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 text-muted-foreground">
                    <Package className="mb-2 h-8 w-8" />
                    <p>No products found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10 bg-background">
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Name</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">SKU</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Category</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Stock</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Reorder Level</th>
                          <th className="px-4 py-3 text-center text-sm font-medium text-muted-foreground">Status</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products?.map((p: Product & { stock_balance: number }) => {
                          const isLow = p.reorder_level !== null && p.stock_balance <= Number(p.reorder_level);
                          return (
                            <tr
                              key={p.id}
                              className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                              onClick={() => setSelectedProduct(p)}
                            >
                              <td className="px-4 py-3 text-sm font-medium">{p.name}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{p.sku || "—"}</td>
                              <td className="px-4 py-3 text-sm text-muted-foreground">{p.category || "—"}</td>
                              <td className="px-4 py-3 text-right text-sm font-medium">
                                {p.stock_balance} {p.unit}
                              </td>
                              <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                                {p.reorder_level ?? "—"}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isLow ? (
                                  <Badge variant="destructive">Low Stock</Badge>
                                ) : (
                                  <Badge variant="secondary">In Stock</Badge>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setConfirmDeleteProduct(p); }}
                                  className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-accent transition-colors"
                                  title="Delete product"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeTab === "movements" && (
            <Card>
              <CardContent className="p-0">
                {movementsLoading ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="sticky top-0 z-10 bg-background">
                        <tr className="border-b">
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Date</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Product</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Type</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Qty</th>
                          <th className="px-4 py-3 text-right text-sm font-medium text-muted-foreground">Balance</th>
                          <th className="px-4 py-3 text-left text-sm font-medium text-muted-foreground">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {movements?.map((m: StockMovement & { products?: { name: string } }) => (
                          <tr key={m.id} className="border-b transition-colors hover:bg-muted/50">
                            <td className="px-4 py-3 text-sm text-muted-foreground">
                              {new Date(m.created_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">{m.products?.name ?? "—"}</td>
                            <td className="px-4 py-3 text-sm">
                              <Badge variant={m.movement_type === "purchase" ? "default" : "secondary"}>
                                {m.movement_type}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium">{m.quantity}</td>
                            <td className="px-4 py-3 text-right text-sm">{m.running_balance}</td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{m.reason || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {showProductForm && (
        <ProductForm onClose={() => setShowProductForm(false)} />
      )}

      {showMovementForm && (
        <StockMovementForm onClose={() => setShowMovementForm(false)} />
      )}

      {selectedProduct && (
        <ProductForm
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteProduct !== null}
        onOpenChange={(open) => { if (!open) setConfirmDeleteProduct(null); }}
        title="Delete Product"
        description={`Delete "${confirmDeleteProduct?.name}"?`}
        consequence="The product will be deactivated and hidden from inventory lists. Stock movements will remain for record-keeping."
        entity={`Product: ${confirmDeleteProduct?.name ?? ""}`}
        confirmLabel="Delete Product"
        onConfirm={() => {
          if (!confirmDeleteProduct) return;
          deleteProduct.mutate(confirmDeleteProduct.id, {
            onSuccess: () => {
              showSuccess(`Product "${confirmDeleteProduct.name}" deleted`);
              setConfirmDeleteProduct(null);
            },
            onError: (err) => showError((err as Error)?.message || "Failed to delete product"),
          });
        }}
        isPending={deleteProduct.isPending}
      />
    </div>
  );
}

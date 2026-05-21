import { cn } from '../../lib/core/utils';

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  ref?: React.Ref<HTMLTableElement>;
}
interface TableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  ref?: React.Ref<HTMLTableSectionElement>;
}
interface TableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {
  ref?: React.Ref<HTMLTableSectionElement>;
}
interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  ref?: React.Ref<HTMLTableRowElement>;
}
interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  ref?: React.Ref<HTMLTableCellElement>;
}
interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  ref?: React.Ref<HTMLTableCellElement>;
}

export function Table({ className, ref, ...props }: TableProps) {
  return <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />;
}
export function TableHeader({ className, ref, ...props }: TableHeaderProps) {
  return <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />;
}
export function TableBody({ className, ref, ...props }: TableBodyProps) {
  return <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}
export function TableRow({ className, ref, ...props }: TableRowProps) {
  return <tr ref={ref} className={cn('border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted', className)} {...props} />;
}
export function TableHead({ className, ref, ...props }: TableHeadProps) {
  return <th ref={ref} className={cn('h-10 px-4 text-left align-middle font-medium text-muted-foreground', className)} {...props} />;
}
export function TableCell({ className, ref, ...props }: TableCellProps) {
  return <td ref={ref} className={cn('p-4 align-middle', className)} {...props} />;
}

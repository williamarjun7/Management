import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '../../lib/core/utils';

export function DropdownMenu({ ...props }: DropdownMenuPrimitive.DropdownMenuProps) {
  return <DropdownMenuPrimitive.Root {...props} />;
}
export function DropdownMenuTrigger({ ...props }: DropdownMenuPrimitive.DropdownMenuTriggerProps) {
  return <DropdownMenuPrimitive.Trigger asChild {...props} />;
}
export function DropdownMenuContent({ className, ...props }: DropdownMenuPrimitive.DropdownMenuContentProps) {
  return <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content className={cn('z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md', className)} {...props} />
  </DropdownMenuPrimitive.Portal>;
}
export function DropdownMenuItem({ className, ...props }: DropdownMenuPrimitive.DropdownMenuItemProps) {
  return <DropdownMenuPrimitive.Item className={cn('relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)} {...props} />;
}
export function DropdownMenuSeparator({ className, ...props }: DropdownMenuPrimitive.DropdownMenuSeparatorProps) {
  return <DropdownMenuPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

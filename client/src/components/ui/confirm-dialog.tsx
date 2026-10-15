import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── useConfirm / ConfirmDialog ─────────────────────────────────────────────
// A promise-based replacement for the browser's native confirm(). Mount
// <ConfirmProvider> once near the app root, then call the hook anywhere:
//
//   const confirm = useConfirm();
//   if (await confirm({ title: "Remove this payment?", tone: "destructive" })) …
//
// The dialog is the shadcn AlertDialog styled with the venue's serif title, so
// every destructive confirmation looks and behaves the same across the app.

export type ConfirmOptions = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
};

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/** Controlled confirmation dialog. Usually driven by ConfirmProvider. */
function ConfirmDialog({
  open,
  options,
  onResolve,
}: {
  open: boolean;
  options: ConfirmOptions;
  onResolve: (result: boolean) => void;
}) {
  const {
    title = "Are you sure?",
    description,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    tone = "default",
  } = options;

  return (
    <AlertDialog open={open} onOpenChange={o => { if (!o) onResolve(false); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-cormorant text-2xl font-semibold text-ink">
            {title}
          </AlertDialogTitle>
          {description && <AlertDialogDescription className="font-dm">{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onResolve(false)}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            autoFocus
            onClick={() => onResolve(true)}
            className={cn(tone === "destructive" && buttonVariants({ variant: "destructive" }))}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type PendingState = { open: boolean; options: ConfirmOptions; resolve: (v: boolean) => void };

function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = React.useState<PendingState | null>(null);

  const confirm = React.useCallback<ConfirmFn>((options = {}) => {
    return new Promise<boolean>(resolve => {
      setPending({ open: true, options, resolve });
    });
  }, []);

  const resolveWith = React.useCallback((result: boolean) => {
    setPending(prev => {
      prev?.resolve(result);
      // Keep options around while the close animation runs; just flip `open`.
      return prev ? { ...prev, open: false } : null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={pending?.open ?? false}
        options={pending?.options ?? {}}
        onResolve={resolveWith}
      />
    </ConfirmContext.Provider>
  );
}

/** Returns an async confirm() — resolves true if confirmed, false otherwise. */
function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within a <ConfirmProvider>");
  return ctx;
}

export { ConfirmDialog, ConfirmProvider, useConfirm };

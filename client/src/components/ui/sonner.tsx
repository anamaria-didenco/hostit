import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      duration={4000}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          // Sonner's default toast width is 356px. Cap it to the screen so a long
          // unbreakable message (a raw server error, a URL) can't stretch the
          // toast past a phone's edge and drag the whole page layout wider.
          "--width": "min(356px, calc(100vw - 32px))",
        } as React.CSSProperties
      }
      toastOptions={{ style: { overflowWrap: "anywhere" } }}
      {...props}
    />
  );
};

export { Toaster };

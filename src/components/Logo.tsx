import Image from "next/image";

/**
 * ScalePods logo on a transparent background.
 * variant "auto" follows light / dark mode; "dark" is for always-dark surfaces (the steel sidebar, the login panel).
 */
export function Logo({ variant = "auto", className = "", priority = false }: { variant?: "auto" | "light" | "dark"; className?: string; priority?: boolean }) {
  const light = <Image src="/brand/scalepods-logo-light.webp" alt="ScalePods Stock" width={1200} height={206} priority={priority} loading={priority ? undefined : "eager"} className={"h-auto w-full " + (variant === "auto" ? "block dark:hidden" : "")} />;
  const dark = <Image src="/brand/scalepods-logo-dark.webp" alt="ScalePods Stock" width={1200} height={207} priority={priority} loading={priority ? undefined : "eager"} className={"h-auto w-full " + (variant === "auto" ? "hidden dark:block" : "")} />;
  return (
    <span className={"block " + className}>
      {variant === "light" ? light : variant === "dark" ? dark : <>{light}{dark}</>}
    </span>
  );
}

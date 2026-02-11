import type { ReactNode } from "react";

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
};

export const SectionHeader = ({
  title,
  // subtitle,
  rightSlot,
}: SectionHeaderProps) => {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {/* {subtitle ? (
          <p className="mt-1 text-xs text-foreground-muted">{subtitle}</p>
        ) : null} */}
      </div>
      {rightSlot ? (
        <div className="rounded-full bg-surface-muted px-3 py-1 text-[10px] font-semibold text-foreground-muted">
          {rightSlot}
        </div>
      ) : null}
    </div>
  );
};

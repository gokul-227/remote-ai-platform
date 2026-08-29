import { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// Each variant maps to one of the card-* classes already defined in
// globals.css (card-enterprise/job/profile/metric/ai/project) — previously
// these were only reachable by applying the raw className directly, which
// meant most of them (job/profile/metric/project) had zero actual usage
// anywhere in the app despite being defined. Routing them through a CVA
// variant prop makes them a discoverable, intentional part of the design
// system rather than dead CSS.
const cardVariants = cva("", {
  variants: {
    variant: {
      enterprise: "card-enterprise",
      job: "card-job",
      profile: "card-profile",
      metric: "card-metric",
      ai: "card-ai",
      project: "card-project",
    },
  },
  defaultVariants: {
    variant: "enterprise",
  },
});

export type CardVariant = NonNullable<VariantProps<typeof cardVariants>["variant"]>;

interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export function Card({ className, variant, children, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ variant }), className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-5 py-4 border-b border-[var(--border-color)]", className)} {...props}>
      {children}
    </div>
  );
}

export function CardBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("px-5 py-4", className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-semibold text-[var(--text-main)]", className)} {...props}>
      {children}
    </h3>
  );
}

export function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  );
}

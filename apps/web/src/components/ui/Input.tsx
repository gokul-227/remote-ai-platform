import { InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, forwardRef, useId } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

interface FieldWrapperProps {
  label?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  id?: string;
}

function FieldWrapper({
  label,
  hint,
  error,
  required,
  id,
  children,
}: FieldWrapperProps & { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[var(--text-main)]">
          {label}
          {required && <span className="text-[var(--color-error)] ml-0.5">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-[var(--color-error)]" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-[var(--text-light)]">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & FieldWrapperProps;

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, hint, error, required, className, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldWrapper label={label} hint={hint} error={error} required={required} id={fieldId}>
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          className={cn("input-enterprise", error && "border-[var(--color-error)] focus:shadow-none", className)}
          {...props}
        />
      </FieldWrapper>
    );
  }
);
Input.displayName = "Input";

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & FieldWrapperProps;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, required, className, id, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldWrapper label={label} hint={hint} error={error} required={required} id={fieldId}>
        <textarea
          ref={ref}
          id={fieldId}
          aria-invalid={!!error}
          className={cn("input-enterprise min-h-[96px] resize-y", error && "border-[var(--color-error)]", className)}
          {...props}
        />
      </FieldWrapper>
    );
  }
);
Textarea.displayName = "Textarea";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & FieldWrapperProps;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, hint, error, required, className, id, children, ...props }, ref) => {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldWrapper label={label} hint={hint} error={error} required={required} id={fieldId}>
        <select ref={ref} id={fieldId} className={cn("input-enterprise cursor-pointer", className)} {...props}>
          {children}
        </select>
      </FieldWrapper>
    );
  }
);
Select.displayName = "Select";

export function SearchInput({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={cn("relative", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-light)]" />
      <input className="input-enterprise pl-10" {...props} />
    </div>
  );
}

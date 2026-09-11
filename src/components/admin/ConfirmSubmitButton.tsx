"use client";

export function ConfirmSubmitButton({
  children,
  confirmMessage,
  className,
  formAction,
}: {
  children: React.ReactNode;
  confirmMessage: string;
  className?: string;
  formAction?: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <button
      type="submit"
      formAction={formAction}
      className={className}
      onClick={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </button>
  );
}

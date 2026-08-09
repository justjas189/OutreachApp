"use client";

type ConfirmSubmitButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  confirmation: string;
};

export function ConfirmSubmitButton({ confirmation, onClick, ...props }: ConfirmSubmitButtonProps) {
  return (
    <button
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented && !window.confirm(confirmation)) event.preventDefault();
      }}
      type="submit"
    />
  );
}

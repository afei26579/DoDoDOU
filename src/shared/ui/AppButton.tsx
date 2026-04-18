import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type AppButtonProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>;

export function AppButton({ children, type = 'button', ...props }: AppButtonProps) {
  return (
    <button type={type} {...props}>
      {children}
    </button>
  );
}

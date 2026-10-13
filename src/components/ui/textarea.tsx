import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

/**
 * Text boxes grow with their content instead of hiding lines behind a fixed
 * height, so everything typed stays readable while editing. Growth is capped
 * so a long paste-in stays scrollable inside dialogs.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, onInput, ...props }, forwardedRef) => {
  const nodeRef = React.useRef<HTMLTextAreaElement | null>(null);

  const grow = React.useCallback(() => {
    const el = nodeRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  React.useLayoutEffect(grow, [grow, props.value, props.defaultValue]);

  const setRef = React.useCallback(
    (el: HTMLTextAreaElement | null) => {
      nodeRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
      grow();
    },
    [forwardedRef, grow],
  );

  return (
    <textarea
      className={cn(
        "flex min-h-[80px] max-h-[60vh] w-full resize-none overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={setRef}
      onInput={(e) => {
        grow();
        onInput?.(e);
      }}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };

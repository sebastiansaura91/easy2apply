import { useState } from "react";
import { Check, ChevronsUpDown, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import { getAllRoles } from "@/lib/role-advice";
import { useLanguage } from "@/i18n/LanguageContext";
import { cn } from "@/lib/utils";

export const CUSTOM_ROLE = "__custom__";

interface Props {
  /** Selected role id, or CUSTOM_ROLE. */
  value: string;
  onChange: (value: string) => void;
  /** Display label for the current selection (ignored when custom). */
  selectedLabel: string;
}

/**
 * Searchable, category-grouped role picker covering the full role catalog. Replaces a
 * flat select that couldn't scale to 100+ roles — type to filter across all categories.
 */
export function RolePicker({ value, onChange, selectedLabel }: Props) {
  const { language } = useLanguage();
  const isSv = language === "sv";
  const [open, setOpen] = useState(false);
  const groups = getAllRoles(language);

  const triggerLabel =
    value === CUSTOM_ROLE
      ? (isSv ? "Egen roll…" : "Custom role…")
      : (selectedLabel || (isSv ? "Välj roll" : "Choose role"));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="h-11 w-full justify-between font-normal">
          <span className="flex min-w-0 items-center gap-2">
            <Target className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={isSv ? "Sök roll…" : "Search role…"} />
          <CommandList className="max-h-72">
            <CommandEmpty>{isSv ? "Ingen roll hittad." : "No role found."}</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.id} heading={g.label}>
                {g.roles.map((role) => (
                  <CommandItem
                    key={role.id}
                    value={`${role.label} ${g.label}`}
                    onSelect={() => { onChange(role.id); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5", value === role.id ? "opacity-100" : "opacity-0")} />
                    {role.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
            <CommandGroup heading={isSv ? "Annat" : "Other"}>
              <CommandItem
                value={isSv ? "egen roll custom" : "custom role"}
                onSelect={() => { onChange(CUSTOM_ROLE); setOpen(false); }}
              >
                <Check className={cn("mr-2 h-3.5 w-3.5", value === CUSTOM_ROLE ? "opacity-100" : "opacity-0")} />
                {isSv ? "Egen roll…" : "Custom role…"}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

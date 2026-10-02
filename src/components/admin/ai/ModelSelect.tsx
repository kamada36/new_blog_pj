"use client";

import { MODELS, type ModelDef } from "@/lib/ai/models";

const PROVIDER_LABEL = { gemini: "Gemini", claude: "Claude" } as const;

export function ModelSelect({
  label,
  value,
  onChange,
  models = MODELS,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  onChange: (modelId: string) => void;
  models?: ModelDef[];
  disabled?: boolean;
  hint?: string;
}) {
  const selected = models.find((m) => m.id === value);
  return (
    <div>
      <label className="text-xs font-semibold text-foreground-muted">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
      >
        {(["gemini", "claude"] as const).map((provider) => {
          const group = models.filter((m) => m.provider === provider);
          if (group.length === 0) return null;
          return (
            <optgroup key={provider} label={PROVIDER_LABEL[provider]}>
              {group.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}(${m.inputPricePerM} / ${m.outputPricePerM})
                </option>
              ))}
            </optgroup>
          );
        })}
      </select>
      <p className="mt-1 text-xs text-foreground-muted">
        {selected?.note ?? hint}
        {selected && "　単価: 入力/出力 100万トークンあたり(USD)"}
      </p>
    </div>
  );
}

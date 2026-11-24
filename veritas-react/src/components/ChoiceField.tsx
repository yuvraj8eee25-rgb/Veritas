import { useId } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Select } from "radix-ui";

type Option<T extends string | number> = { value: T; label: string };

export default function ChoiceField<T extends string | number>({
  label, options, value, onChange, disabled = false, required = false, id,
}: {
  label: string;
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  required?: boolean;
  id?: string;
}) {
  const groupName = useId();
  const labelId = `${id ?? groupName}-label`;

  if (options.length > 0 && options.length <= 4) {
    return (
      <fieldset className="workspace-fieldset choice-field" id={id} disabled={disabled}>
        <legend>{label}</legend>
        <div className="segmented">
          {options.map(option => (
            <label key={option.value} className="choice-segment">
              <input type="radio" name={groupName} value={option.value}
                checked={value === option.value} required={required}
                onChange={() => onChange(option.value)} />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
    );
  }

  const encode = (value: T) => value === "" ? groupName : String(value);
  const emptyOption = options.find(option => option.value === "");
  return (
    <div className="workspace-field choice-field">
      <span id={labelId}>{label}</span>
      <Select.Root value={required && value === "" ? "" : encode(value)} disabled={disabled || options.length === 0} required={required}
        onValueChange={next => {
          const option = options.find(option => encode(option.value) === next);
          if (option) onChange(option.value);
        }}>
        <Select.Trigger id={id} className="choice-trigger" aria-labelledby={labelId}>
          <Select.Value placeholder={emptyOption?.label ?? "Choose an option"} />
          <Select.Icon asChild><ChevronDown size={16} aria-hidden="true" /></Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="choice-listbox" position="popper" sideOffset={6}>
            <Select.Viewport>
              {options.map(option => (
                <Select.Item className="choice-listbox-option" key={option.value}
                  value={encode(option.value)} disabled={required && option.value === ""}>
                  <Select.ItemText>{option.label}</Select.ItemText>
                  <Select.ItemIndicator><Check size={16} aria-hidden="true" /></Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

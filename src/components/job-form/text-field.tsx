import { useId } from 'react';
import type { AnyFieldApi } from '@tanstack/react-form';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type Props = {
  /** The field from TanStack Form's `<form.Field>` render prop. Its value must be a string. */
  field: AnyFieldApi;
  label: string;
  placeholder?: string;
};

/** A labelled text input wired to a TanStack Form field, showing its error once it is touched. */
export function TextField({ field, label, placeholder }: Props) {
  const id = useId();
  const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        placeholder={placeholder}
        value={field.state.value}
        aria-invalid={isInvalid}
        onBlur={field.handleBlur}
        onChange={(e) => field.handleChange(e.target.value)}
      />
      {isInvalid && <FieldError errors={field.state.meta.errors} />}
    </Field>
  );
}

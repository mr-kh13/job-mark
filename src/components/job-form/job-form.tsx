import { useForm } from '@tanstack/react-form';
import { z } from 'zod';
import { OptionSelect } from '@/components/option-select';
import { StatusSelect } from '@/components/status-select';
import { TextField } from './text-field';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  EMPLOYMENT_TYPES,
  MAX_TEXT_LENGTH,
  MAX_URL_LENGTH,
  STATUSES,
  WORK_ARRANGEMENTS,
  type JobRef,
  type NewJob,
} from '@/store/job';
import { isWebLink } from '@/utils/url';

const TEXT_TOO_LONG = `Use ${MAX_TEXT_LENGTH} characters or fewer.`;

const FormValues = z.object({
  title: z.string().trim().min(1, 'Add the job title.').max(MAX_TEXT_LENGTH, TEXT_TOO_LONG),
  company: z.string().trim().min(1, 'Add the company name.').max(MAX_TEXT_LENGTH, TEXT_TOO_LONG),
  location: z.string().max(MAX_TEXT_LENGTH, TEXT_TOO_LONG),
  workArrangement: z.enum(WORK_ARRANGEMENTS).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  salary: z.string().max(MAX_TEXT_LENGTH, TEXT_TOO_LONG),
  url: z
    .string()
    .trim()
    .max(MAX_URL_LENGTH, `Use ${MAX_URL_LENGTH} characters or fewer.`)
    .refine(
      (value) => value === '' || isWebLink(value),
      'Enter a link that starts with http:// or https://.',
    ),
  status: z.enum(STATUSES),
});
type FormValues = z.infer<typeof FormValues>;

type Props = {
  /** Fixed by whoever opens the form, such as a fresh manual id. */
  jobRef: Pick<JobRef, 'id' | 'source'>;
  /** What the fields start with, such as a draft read from a page. */
  defaultValues?: Partial<
    Pick<
      NewJob,
      'title' | 'company' | 'location' | 'workArrangement' | 'employmentType' | 'salary' | 'url'
    >
  >;
  submitLabel?: string;
  onSubmit: (job: NewJob) => void | Promise<void>;
  onCancel: () => void;
};

/** The form for a job entered by hand. The title and company are required; the link is optional. */
export function JobForm({
  jobRef,
  defaultValues = {},
  submitLabel = 'Save',
  onSubmit,
  onCancel,
}: Props) {
  const form = useForm({
    defaultValues: {
      title: defaultValues.title ?? '',
      company: defaultValues.company ?? '',
      location: defaultValues.location ?? '',
      workArrangement: defaultValues.workArrangement,
      employmentType: defaultValues.employmentType,
      salary: defaultValues.salary ?? '',
      url: defaultValues.url ?? '',
      status: 'Applied',
    } as FormValues,
    validators: { onSubmit: FormValues },
    onSubmit: ({ value }) =>
      onSubmit({
        id: jobRef.id,
        source: jobRef.source,
        title: value.title,
        company: value.company,
        location: value.location,
        workArrangement: value.workArrangement,
        employmentType: value.employmentType,
        salary: value.salary,
        url: value.url,
        status: value.status,
      }),
  });

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <FieldGroup className="gap-3">
        <form.Field name="title">
          {(field) => <TextField field={field} label="Title" placeholder="Platform Engineer" />}
        </form.Field>
        <form.Field name="company">
          {(field) => <TextField field={field} label="Company" placeholder="Acme" />}
        </form.Field>
        <form.Field name="location">
          {(field) => <TextField field={field} label="Location" placeholder="Sydney" />}
        </form.Field>
        <div className="grid grid-cols-2 gap-3">
          <form.Field name="workArrangement">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="job-arrangement">Work arrangement</FieldLabel>
                <OptionSelect
                  id="job-arrangement"
                  label="Work arrangement"
                  options={WORK_ARRANGEMENTS}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                />
              </Field>
            )}
          </form.Field>
          <form.Field name="employmentType">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="job-employment">Employment type</FieldLabel>
                <OptionSelect
                  id="job-employment"
                  label="Employment type"
                  options={EMPLOYMENT_TYPES}
                  value={field.state.value}
                  onValueChange={field.handleChange}
                />
              </Field>
            )}
          </form.Field>
        </div>
        <form.Field name="salary">
          {(field) => <TextField field={field} label="Salary" placeholder="$120k - $140k" />}
        </form.Field>
        <form.Field name="url">
          {(field) => <TextField field={field} label="Job link" placeholder="https://" />}
        </form.Field>
        <form.Field name="status">
          {(field) => (
            <Field>
              <FieldLabel htmlFor="job-status">Status</FieldLabel>
              <StatusSelect
                id="job-status"
                label="Status"
                value={field.state.value}
                onValueChange={field.handleChange}
                className="w-full"
              />
            </Field>
          )}
        </form.Field>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1">
            {submitLabel}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </FieldGroup>
    </form>
  );
}

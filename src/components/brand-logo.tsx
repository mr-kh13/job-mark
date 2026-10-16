import lockup from '@/assets/jobmark-lockup.svg';
import lockupDark from '@/assets/jobmark-lockup-dark.svg';

type BrandLogoProps = {
  className?: string;
};

/** The Jobmark mark and name, in the light or dark colours the system is set to. */
export function BrandLogo({ className }: BrandLogoProps) {
  return (
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet={lockupDark} />
      <img src={lockup} alt="Jobmark" className={className} />
    </picture>
  );
}

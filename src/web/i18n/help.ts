import { help as en } from './help.en';
import { help as sq } from './help.sq';
import { useLocale } from './index';

// The guides in the interface language (#194); imported only by the help pages, so they load with them.

const HELP = { sq, en } as const;

export function useHelp() {
  return HELP[useLocale()];
}

export { type Guide, type HelpStep, SHOTS, type Shot } from './help.sq';

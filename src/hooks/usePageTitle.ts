import { useEffect } from 'react';

/**
 * Custom hook to dynamically update the document title.
 * Formats title as 'OVMS – {title}'.
 * Falls back to 'OVMS – Operations Visual Management System' if no title is provided.
 */
export function usePageTitle(title?: string) {
  useEffect(() => {
    if (title) {
      document.title = `OVMS – ${title}`;
    } else {
      document.title = 'OVMS – Operations Visual Management System';
    }
  }, [title]);
}

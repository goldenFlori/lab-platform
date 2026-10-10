import DOMPurify from 'dompurify';

// Notebook HTML comes from what staff upload, and students read it on our origin. Nothing in it may
// run code, restyle the page or ask for input, whatever the notebook contains.

const purify = DOMPurify();

purify.addHook('afterSanitizeAttributes', (node) => {
  // Links to other sites open in a new tab, so a student does not lose their place in the lab.
  if (node instanceof HTMLAnchorElement && node.href && node.origin !== window.location.origin) {
    node.target = '_blank';
    node.rel = 'noopener noreferrer';
  }
});

const OPTIONS = {
  FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed'],
  ADD_ATTR: ['target'],
};

export function sanitize(html: string): string {
  return purify.sanitize(html, OPTIONS);
}

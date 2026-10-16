import { describe, expect, it } from 'vitest';
import { classifyButton, classifyLabel, findClickable } from './click-classifier';

const render = (html: string) => {
  document.body.innerHTML = html;
  return (id: string) => document.getElementById(id)!;
};

describe('classifyLabel', () => {
  it.each([
    ['Apply', 'apply'],
    ['APPLY', 'apply'],
    ['apply now', 'apply'],
    ['Quick apply', 'apply'],
    ['Easy Apply', 'apply'],
    ['  Easy   Apply  ', 'apply'],
    ['Easy Apply to Software Engineer at Acme', 'apply'],
    ['Apply on company site', 'apply'],
    ['Apply on company website', 'apply'],
    ['Apply for Software Engineer / Full Stack Engineer (All Levels)', 'apply'],
    ['Apply\u2060', 'apply'],
    ['Save', 'save'],
    ['SAVE', 'save'],
    ['Save job', 'save'],
    ['Save Software Engineer at Acme', 'save'],
    ['Save Search Engineer at Acme', 'save'],
  ] as const)('reads "%s" as %s', (label, expected) => {
    expect(classifyLabel(label)).toBe(expected);
  });

  it.each([
    'Applied',
    'Saved',
    'Saved jobs',
    'Unsave',
    'Easy Apply filter',
    'Apply filters',
    'Save search',
    'Save job alert',
    'Save job alerts',
    'Sign in to save this job',
    'Applications',
    'Apply for',
    'Share',
    '',
  ])('ignores "%s"', (label) => {
    expect(classifyLabel(label)).toBeNull();
  });
});

describe('findClickable', () => {
  it('returns the button, link or role=button element itself', () => {
    const get = render(`
      <button id="button">Apply</button>
      <a id="link" href="/x">Apply</a>
      <div id="role" role="button">Apply</div>
    `);

    expect(findClickable(get('button'))).toBe(get('button'));
    expect(findClickable(get('link'))).toBe(get('link'));
    expect(findClickable(get('role'))).toBe(get('role'));
  });

  it('resolves a click on a child element to the enclosing button', () => {
    const get = render('<button id="b"><span><i id="icon"></i>Easy Apply</span></button>');

    expect(findClickable(get('icon'))).toBe(get('b'));
  });

  it('returns null outside any clickable element', () => {
    const get = render('<p id="p">Apply</p>');

    expect(findClickable(get('p'))).toBeNull();
  });

  it('returns null when the target is missing or not an element', () => {
    expect(findClickable(null)).toBeNull();
    expect(findClickable(document)).toBeNull();
  });
});

describe('classifyButton', () => {
  it('classifies by the visible text', () => {
    const get = render('<button id="a">Quick apply</button><button id="s">Save</button>');

    expect(classifyButton(get('a'))).toBe('apply');
    expect(classifyButton(get('s'))).toBe('save');
  });

  it('falls back to the aria-label for an icon-only button', () => {
    const get = render('<button id="b" aria-label="Save"><svg></svg></button>');

    expect(classifyButton(get('b'))).toBe('save');
  });

  it('prefers the visible text over the aria-label', () => {
    const get = render('<button id="b" aria-label="Save">Apply</button>');

    expect(classifyButton(get('b'))).toBe('apply');
  });

  it('ignores a button that shows a finished state, whatever its aria-label says', () => {
    const get = render(`
      <button id="applied" aria-label="Apply">Applied</button>
      <button id="saved" aria-label="Save job">Saved</button>
      <button id="unsave" aria-label="Save job">Unsave</button>
    `);

    expect(classifyButton(get('applied'))).toBeNull();
    expect(classifyButton(get('saved'))).toBeNull();
    expect(classifyButton(get('unsave'))).toBeNull();
  });

  it('returns null for a button that is neither Apply nor Save', () => {
    const get = render('<button id="b" aria-label="Share">Share</button>');

    expect(classifyButton(get('b'))).toBeNull();
  });
});

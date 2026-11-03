/** Public addresses use stable slugs. IDs remain valid for older cached responses. */
export function communityHref(community: { id: string; slug?: string | null }): string {
  return `/t/${encodeURIComponent(community.slug || community.id)}`;
}

/** Validate before choosing a PostgreSQL UUID column; never cast a slug to UUID. */
export function communityIdentifier(value: string): { kind: 'id' | 'slug'; value: string } | null {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return { kind: 'id', value: value.toLowerCase() };
  }
  if (value.length <= 90 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value)) {
    return { kind: 'slug', value: value.toLowerCase() };
  }
  return null;
}

import Link from "next/link";

export type TagGroup = [label: string, items: string[]];

interface TagGroupsProps {
  groups: TagGroup[];
  /** Turn each tag into a search for that tag. Off inside the upload flow. */
  linkToSearch?: boolean;
}

/**
 * Label/chips rows used by the image page and the upload review step, so
 * metadata reads the same everywhere. Labels sit in a fixed column from
 * `sm` up and stack above their chips on phones.
 */
export function TagGroups({ groups, linkToSearch = false }: TagGroupsProps) {
  // Duplicate tags add nothing; dropping them also makes each value a stable key.
  const visible = groups
    .map(([label, items]): TagGroup => [label, Array.from(new Set(items))])
    .filter(([, items]) => items.length > 0);
  if (visible.length === 0) return null;

  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
      {visible.map(([label, items]) => (
        <div key={label} className="contents">
          <dt
            className="text-xs font-semibold uppercase sm:pt-1.5"
            style={{ color: "var(--color-text-secondary)", letterSpacing: "0.08em" }}
          >
            {label}
          </dt>
          <dd className="-mt-2 sm:mt-0">
            <ul className="flex flex-wrap gap-1.5">
              {items.map((item) => (
                <li key={item} className="min-w-0">
                  {linkToSearch ? (
                    <Link
                      href={`/?q=${encodeURIComponent(item)}`}
                      className="tag tag-link pressable"
                      title={`Search for “${item}”`}
                    >
                      {item}
                    </Link>
                  ) : (
                    <span className="tag">{item}</span>
                  )}
                </li>
              ))}
            </ul>
          </dd>
        </div>
      ))}
    </dl>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, UserPlus } from "lucide-react";
import { getSupabase } from "../../lib/supabase-browser";
type Person = {
  id: string;
  display_name: string;
  username: string | null;
  avatar_path: string | null;
};
export default function FriendsPage() {
  const [query, setQuery] = useState(""),
    [people, setPeople] = useState<Person[]>([]),
    [sent, setSent] = useState(new Set<string>());
  useEffect(() => {
    const timer = setTimeout(
      () =>
        void (async () => {
          const supabase = getSupabase(),
            {
              data: { user },
            } = await supabase.auth.getUser();
          let request = supabase
            .from("profiles")
            .select("id,display_name,username,avatar_path")
            .neq("id", user?.id ?? "")
            .limit(40);
          if (query.trim())
            request = request.or(
              `display_name.ilike.%${query.trim()}%,username.ilike.%${query.trim()}%`,
            );
          const { data } = await request;
          setPeople((data ?? []) as Person[]);
        })(),
      220,
    );
    return () => clearTimeout(timer);
  }, [query]);
  async function add(id: string) {
    const supabase = getSupabase(),
      {
        data: { user },
      } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("user_friendships")
      .insert({ requester_id: user.id, addressee_id: id });
    if (!error) setSent((current) => new Set(current).add(id));
  }
  return (
    <main className="friends-page">
      <nav>
        <Link className="brand" href="/">
          NOCTURNE<span>°</span>
        </Link>
        <Link className="back" href="/profile">
          <ArrowLeft size={16} />
          Profil
        </Link>
      </nav>
      <section>
        <p className="eyebrow">COMMUNAUTÉ</p>
        <h1>Ajouter des amis.</h1>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Nom ou pseudo"
        />
        <div>
          {people.map((person) => (
            <article key={person.id}>
              <span className="friends-avatar">
                {person.display_name?.[0]?.toUpperCase() || "?"}
              </span>
              <span>
                <strong>{person.display_name || "Membre NOCTURNE"}</strong>
                <small>
                  {person.username ? `@${person.username}` : "Profil membre"}
                </small>
              </span>
              <button
                disabled={sent.has(person.id)}
                onClick={() => void add(person.id)}
              >
                <UserPlus size={16} />
                {sent.has(person.id) ? "Envoyée" : "Ajouter"}
              </button>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

const clientPosts = [
  {
    id: 1,
    content: "Looking for a realism lion piece on forearm",
    timeAgo: "2h ago",
  },
  {
    id: 2,
    content: "$400 budget, want a memorial tattoo",
    timeAgo: "5h ago",
  },
];

export const ClientPosts = () => {
  return (
    <section data-aos="fade-up" className="px-4 py-12 max-w-6xl mx-auto">
      <h2>Client Posts</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {clientPosts.map((post) => (
          <div
            key={post.id}
            className="rounded-md p-4"
            style={{ backgroundColor: "var(--color-bg-card)" }}
          >
            <p style={{ color: "var(--color-text-light)" }}>{post.content}</p>
            <span
              className="text-xs mt-2 block"
              style={{ color: "var(--color-text-muted)" }}
            >
              {post.timeAgo}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 text-right">
        <a
          href="/client-posts"
          className="text-sm underline"
          style={{ color: "var(--color-primary)" }}
        >
          View all posts →
        </a>
      </div>
    </section>
  );
};

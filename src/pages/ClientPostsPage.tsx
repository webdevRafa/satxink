// src/pages/ClientPostsPage.tsx

const clientPosts = [
  {
    id: 1,
    title: "Looking for a realism lion piece on forearm",
    timeAgo: "2h ago",
    budget: "$300-$500",
  },
  {
    id: 2,
    title: "$400 budget, want a memorial tattoo",
    timeAgo: "5h ago",
    budget: "$400",
  },
  {
    id: 3,
    title: "Neo-traditional snake wrapping around wrist",
    timeAgo: "1d ago",
    budget: "$250",
  },
  {
    id: 4,
    title: "Blackwork filler to connect sleeve gap",
    timeAgo: "2d ago",
    budget: "$150",
  },
];

export const ClientPostsPage = () => {
  return (
    <main className="px-4 py-12 max-w-6xl mx-auto">
      <h1 className="text-3xl font-semibold text-white mb-2">
        Client Tattoo Requests
      </h1>
      <p className="text-gray-400 mb-8">
        Browse open requests from people in San Antonio looking for artists.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {clientPosts.map((post) => (
          <div
            key={post.id}
            className="rounded-md p-4"
            style={{ backgroundColor: "var(--color-bg-card)" }}
          >
            <h3 className="text-base font-semibold text-white mb-1">
              {post.title}
            </h3>
            <p className="text-sm text-gray-400 mb-2">Budget: {post.budget}</p>
            <span className="text-xs text-gray-500">{post.timeAgo}</span>
          </div>
        ))}
      </div>
    </main>
  );
};

// pages/ClientProfileSetupPage.tsx
import { useState } from "react";
import { getAuth } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/firebaseConfig";
import { useNavigate } from "react-router-dom";

const stylesList = [
  "Traditional",
  "Neo-Traditional",
  "Realism",
  "Blackwork",
  "Watercolor",
  "Japanese",
  "Script",
  "Geometric",
  "Minimalist",
  "Portrait",
  "Chicano",
  "Fine Line",
  "Dotwork",
  "Trash Polka",
  "New School",
  "Surrealism",
];

const ClientProfileSetupPage = () => {
  const [bio, setBio] = useState("");
  const [preferredStyles, setPreferredStyles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  const toggleStyle = (style: string) => {
    setPreferredStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const user = getAuth().currentUser;
      if (!user) throw new Error("No user logged in");

      const userRef = doc(db, "users", user.uid);
      await updateDoc(userRef, {
        bio,
        preferredStyles,
        profileComplete: true,
      });

      navigate("/dashboard");
    } catch (error) {
      console.error("Profile update failed:", error);
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen  text-white flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl space-y-6  p-8 rounded-2xl shadow-xl"
      >
        <h1 className="text-3xl! font-light! text-center mb-4">
          Complete Your Profile
        </h1>

        <div>
          <label className="block mb-2 text-zinc-300 font-medium">
            Short Bio
          </label>
          <textarea
            className="w-full p-3 rounded-lg bg-[var(--color-bg-base)] border border-zinc-700 text-white"
            rows={4}
            placeholder="Tell us what you're looking for..."
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block mb-2 text-zinc-300 font-medium">
            Preferred Styles
          </label>
          <div className="flex flex-wrap gap-3">
            {stylesList.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => toggleStyle(style)}
                className={`px-4! py-2! text-sm!  border-[var(--color-bg-button)] hover:bg-[var(--color-bg-button)] border-1 rounded-full  transition ${
                  preferredStyles.includes(style)
                    ? "bg-neutral-400  text-[#121212]"
                    : "bg-[var(--color-bg-footer)]  text-zinc-300"
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full max-w-[170px]  py-2! rounded-lg bg-[var(--color-bg-card)] hover:bg-neutral-300 transition  text-white hover:text-[#121212]"
        >
          {submitting ? "Saving..." : "Finish & Explore"}
        </button>
      </form>
    </div>
  );
};

export default ClientProfileSetupPage;

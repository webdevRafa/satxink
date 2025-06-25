import { useEffect, useState } from "react";
import { GoogleSignupButton } from "../components/GoogleSignupButton";
import logo from "../assets/logo.svg";
import type { User } from "firebase/auth";
import { auth, db } from "../firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import {
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

type Shop = {
  id: string;
  name: string;
  address: string;
  mapLink: string;
};

const SPECIALTIES = [
  "Blackwork",
  "Linework",
  "Dotwork",
  "Color",
  "Realism",
  "Neo-Traditional",
  "Micro",
  "Geometric",
  "Anime",
  "Traditional",
  "Japanese",
  "Ornamental",
  "Fine Line",
  "Color Realism",
];

const ArtistSignupPage = () => {
  const [user, setUser] = useState<User | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [shops, setShops] = useState<Shop[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setFormVisible(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchShops = async () => {
      const snapshot = await getDocs(collection(db, "shops"));
      const shopList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Shop, "id">),
      }));
      setShops(shopList);
    };
    fetchShops();
  }, []);
  const sanitizeUrl = (url: string) => {
    if (!url) return "";
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      return "https://" + trimmed;
    }
    return trimmed;
  };

  const isValidUrl = (url: string) => {
    try {
      if (!url) return true;
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };
  const handleArtistSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;

    setSubmitting(true);

    const form = e.currentTarget;

    const displayName = (
      form.elements.namedItem("displayName") as HTMLInputElement
    ).value;
    const bio = (form.elements.namedItem("bio") as HTMLInputElement).value;
    const shopId = (form.elements.namedItem("shopId") as HTMLSelectElement)
      .value;

    let instagram = (form.elements.namedItem("instagram") as HTMLInputElement)
      .value;
    let facebook = (form.elements.namedItem("facebook") as HTMLInputElement)
      .value;
    let website = (form.elements.namedItem("website") as HTMLInputElement)
      .value;

    instagram = sanitizeUrl(instagram);
    facebook = sanitizeUrl(facebook);
    website = sanitizeUrl(website);

    if (
      !isValidUrl(instagram) ||
      !isValidUrl(facebook) ||
      !isValidUrl(website)
    ) {
      alert("One or more of your social links are not valid URLs.");
      setSubmitting(false);

      return;
    }

    const specialties = Array.from(
      form.querySelectorAll("input[name='specialties']:checked")
    ).map((el) => (el as HTMLInputElement).value);

    const newArtist = {
      displayName,
      bio,
      shopId,
      specialties,
      socialLinks: {
        instagram,
        facebook,
        website,
      },
      avatarUrl: user.photoURL || "",
      email: user.email || "",
      featured: false,
      isVerified: false,
      role: "artist",
      createdAt: serverTimestamp(),
    };

    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          ...newArtist,
          portfolioUrls: [],
          likedBy: [],
          updatedAt: serverTimestamp(),
          profileComplete: true,
        },
        { merge: true }
      );

      setSubmitting(false);
      navigate("/artist-dashboard");
    } catch (err) {
      console.error("Artist profile submission failed:", err);
      alert("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen text-white flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <h1 className="flex items-center justify-center flex-wrap text-4xl md:text-5xl font-bold mb-6 gap-2 text-center">
          <span>Join</span>
          <img
            src={logo}
            alt="SATX Ink logo"
            className="max-w-[100px] inline-block"
          />
          <span>as an Artist</span>
        </h1>

        {!user && (
          <>
            <p className="text-zinc-300 mb-8 text-lg">
              Create your artist profile, showcase your portfolio, and connect
              with local clients.
            </p>
            <GoogleSignupButton role="artist" />
            <p className="text-sm text-zinc-500 mt-4">
              We’ll use your Google info to create your account. You can
              complete your profile afterward.
            </p>
          </>
        )}

        {formVisible && (
          <form
            onSubmit={handleArtistSubmit}
            className="mt-10 space-y-4 text-left bg-zinc-900 p-6 rounded-lg"
          >
            <h2 className="text-xl font-semibold text-white mb-2">
              Complete Your Artist Profile
            </h2>

            <input
              type="text"
              name="displayName"
              placeholder="Display Name (e.g. @inkbykai or DotQueen)"
              required
              className="w-full p-2 rounded bg-zinc-800 text-white"
            />

            <textarea
              name="bio"
              placeholder="Your Bio"
              required
              className="w-full p-2 rounded bg-zinc-800 text-white"
            />

            <select
              name="shopId"
              required
              className="w-full p-2 rounded bg-zinc-800 text-white"
            >
              <option value="">Select Your Shop</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>
                  {shop.name}
                </option>
              ))}
            </select>

            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Specialties
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SPECIALTIES.map((style) => (
                  <label
                    key={style}
                    className="flex items-center space-x-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      name="specialties"
                      value={style}
                      className="accent-red-600"
                    />
                    <span>{style}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <input
                type="url"
                name="instagram"
                placeholder="Instagram URL"
                className="w-full p-2 rounded bg-zinc-800 text-white"
              />
              <input
                type="url"
                name="facebook"
                placeholder="Facebook URL"
                className="w-full p-2 rounded bg-zinc-800 text-white"
              />
              <input
                type="url"
                name="website"
                placeholder="Website URL"
                className="w-full p-2 rounded bg-zinc-800 text-white"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="bg-red-600 px-4 py-2 rounded text-white hover:bg-red-700"
            >
              {submitting ? "Submitting..." : "Submit Profile"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default ArtistSignupPage;

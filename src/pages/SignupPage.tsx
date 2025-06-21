import React, { useState } from "react";
import { db, storage } from "../firebase/firebaseConfig";
import { collection, serverTimestamp, doc, setDoc } from "firebase/firestore";

import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
const formatUrl = (url: string) => {
  const trimmed = url.trim();
  if (!trimmed) return ""; // Handle empty strings safely
  return trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `https://${trimmed}`;
};

export const SignupPage = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    instagram: "",
    style: "",
    bio: "",
    location: "",
    studioName: "",
    facebook: "",
    website: "",
    avatarFile: null as File | null,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, files } = e.target;
    if (name === "avatarFile" && files) {
      setFormData((prev) => ({ ...prev, avatarFile: files[0] }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Create a new doc ID first
      const newDocRef = doc(collection(db, "users"));
      const userId = newDocRef.id;

      let avatarUrl = "";

      if (formData.avatarFile) {
        const avatarRef = ref(storage, `users/${userId}/avatar.jpg`);
        await uploadBytes(avatarRef, formData.avatarFile);
        avatarUrl = await getDownloadURL(avatarRef);
      }

      const artistData = {
        name: formData.name,
        email: formData.email,
        role: "artist",
        avatarUrl,
        bio: formData.bio,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        featured: false,
        isAvailable: true,
        isVerified: false,
        likedBy: [],
        location: formData.location,
        studioName: formData.studioName,
        specialties: formData.style.split(",").map((s) => s.trim()),
        portfolioUrls: [],
        socialLinks: {
          instagram: formatUrl(
            `https://instagram.com/${formData.instagram.replace("@", "")}`
          ),
          facebook: formatUrl(formData.facebook),
          website: formatUrl(formData.website),
        },
      };

      await setDoc(newDocRef, artistData);
      alert("Application submitted!");
    } catch (err: any) {
      console.error("🔥 Submission error:", err.message || err);
      alert("Failed to submit. Try again.");
    }
  };

  return (
    <main className="px-4 py-12 max-w-2xl mx-auto text-white">
      <h1 className="text-3xl font-semibold mb-6">Join SATXInk</h1>
      <p className="text-gray-400 mb-8">
        Are you a tattoo artist in San Antonio? Fill out the form below to
        apply.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          name="name"
          placeholder="Your Name"
          onChange={handleChange}
          required
        />
        <input
          name="email"
          type="email"
          placeholder="Email Address"
          onChange={handleChange}
          required
        />
        <input
          name="instagram"
          placeholder="@instagram"
          onChange={handleChange}
        />
        <input
          name="style"
          placeholder="Tattoo Style(s) comma-separated"
          onChange={handleChange}
          required
        />
        <input name="bio" placeholder="Short Bio" onChange={handleChange} />
        <input name="location" placeholder="Location" onChange={handleChange} />
        <input
          name="studioName"
          placeholder="Studio Name"
          onChange={handleChange}
        />
        <input
          name="facebook"
          placeholder="Facebook URL"
          onChange={handleChange}
        />
        <input
          name="website"
          placeholder="Website URL"
          onChange={handleChange}
        />

        <div>
          <label htmlFor="avatarFile" className="block text-gray-300 mb-1">
            Upload a profile picture
          </label>
          <label
            htmlFor="avatarFile"
            className="cursor-pointer inline-block bg-neutral-800 border border-gray-600 px-4 py-2 rounded-md text-gray-400 hover:text-white hover:border-white transition"
          >
            {formData.avatarFile ? formData.avatarFile.name : "Choose File"}
          </label>
          <input
            id="avatarFile"
            name="avatarFile"
            type="file"
            accept="image/*"
            onChange={handleChange}
            className="hidden"
          />
        </div>

        <button
          type="submit"
          className="bg-[#b6382d] text-white py-3 px-6 rounded-md"
        >
          Submit Application
        </button>
      </form>
    </main>
  );
};

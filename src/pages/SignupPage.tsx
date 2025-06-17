// src/pages/SignupPage.tsx
import React, { useState } from "react";

export const SignupPage = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    instagram: "",
    style: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Form submitted:", formData);
    // TODO: send to Firebase
  };

  return (
    <main className="px-4 py-12 max-w-2xl mx-auto text-white">
      <h1 className="text-3xl font-semibold mb-6">Join SATXInk</h1>
      <p className="text-gray-400 mb-8">
        Are you a tattoo artist in San Antonio? Get listed, showcase your work,
        and connect with clients. Fill out the form below to apply.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <input
          type="text"
          name="name"
          placeholder="Your Name"
          value={formData.name}
          onChange={handleChange}
          className="bg-neutral-900 text-white border border-gray-700 rounded-md px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Email Address"
          value={formData.email}
          onChange={handleChange}
          className="bg-neutral-900 text-white border border-gray-700 rounded-md px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
          required
        />
        <input
          type="text"
          name="instagram"
          placeholder="@instagram"
          value={formData.instagram}
          onChange={handleChange}
          className="bg-neutral-900 text-white border border-gray-700 rounded-md px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <input
          type="text"
          name="style"
          placeholder="Tattoo Style(s)"
          value={formData.style}
          onChange={handleChange}
          className="bg-neutral-900 text-white border border-gray-700 rounded-md px-4 py-3 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
          required
        />

        <button
          type="submit"
          className="mt-4 bg-[#b6382d] hover:bg-[#a53228] text-white font-medium py-3 px-6 rounded-md transition"
        >
          Submit Application
        </button>
      </form>
    </main>
  );
};

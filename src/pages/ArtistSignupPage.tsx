import { useEffect, useState } from "react";
import { GoogleSignupButton } from "../components/GoogleSignupButton";
import logo from "../assets/satx-short-sep.svg";
import type { User } from "firebase/auth";
import { auth, db } from "../firebase/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";

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
const stepHeadings = [
  "Tell Us About Yourself",
  "What Styles Do You Specialize In?",
  "How Should Clients Pay You?",
  "Set Your Deposit Policy",
  "You're All Set!",
];
const ArtistSignupPage = ({ onBack }: { onBack: () => void }) => {
  const [paymentType, setPaymentType] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [finalPaymentTiming, setFinalPaymentTiming] = useState("");
  const [externalHandle, setExternalHandle] = useState("");

  const [user, setUser] = useState<User | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");

  const [shops, setShops] = useState<Shop[]>([]);
  const [submitting, setSubmitting] = useState(false); // this controls backend write
  const [readyToSubmit, setReadyToSubmit] = useState(false); // this guards button UI
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [shopId, setShopId] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [website, setWebsite] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    setSubmitting(false); // backend flag
    setReadyToSubmit(false); // UI guard
  }, []);
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        setFormVisible(true);
        setSubmitting(false); // ✅ Only here
      } else {
        setUser(null);
        setFormVisible(false);
      }
    });

    return () => unsubscribe();
  }, []);
  useEffect(() => {
    if (currentStep === 4) {
      setReadyToSubmit(true);
    } else {
      setReadyToSubmit(false);
    }
  }, [currentStep]);
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
    const form = e.currentTarget;
    if (!form) {
      alert("Form not found.");
      setSubmitting(false);
      return;
    }
    if (!user) {
      setSubmitting(false);
      return;
    }

    const sanitizedInstagram = sanitizeUrl(instagram);
    const sanitizedFacebook = sanitizeUrl(facebook);
    const sanitizedWebsite = sanitizeUrl(website);

    // validate URLs
    if (
      !isValidUrl(sanitizedInstagram) ||
      !isValidUrl(sanitizedFacebook) ||
      !isValidUrl(sanitizedWebsite)
    ) {
      alert("One or more of your social links are not valid URLs.");
      setSubmitting(false);
      return;
    }

    const externalPaymentDetails =
      paymentType === "external"
        ? {
            method: selectedMethod,
            handle: externalHandle,
          }
        : null;

    if (!finalPaymentTiming) {
      alert("Please select when you'd like to receive final payment.");
      setSubmitting(false);
      return;
    }
    setSubmitting(true);
    const newArtist = {
      displayName,
      bio,
      shopId,
      specialties,
      socialLinks: {
        instagram: sanitizedInstagram,
        facebook: sanitizedFacebook,
        website: sanitizedWebsite,
      },
      avatarUrl: user.photoURL || "",
      email: user.email || "",
      featured: false,
      isVerified: false,
      role: "artist",
      createdAt: serverTimestamp(),
      paymentType,
      ...(paymentType === "external" && {
        externalPaymentDetails,
        depositPolicy: {
          depositRequired: true,
          amount: depositAmount,
          nonRefundable: true,
        },
        finalPaymentTiming,
      }),
    };
    console.log("Submitting artist:", newArtist);
    console.log("Final Payload →", newArtist);

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
      console.log("redirecting to artist dashboard");
      navigate("/artist-dashboard");
    } catch (err) {
      console.error("Artist profile submission failed:", err);
      alert("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div
      data-aos="fade-up"
      className="min-h-screen  text-white flex items-center justify-center px-4"
    >
      <div className="max-w-2xl w-full text-center">
        {/* Back Button (always visible) */}
        <button
          onClick={onBack}
          className="mb-1 text-neutral-500! hover:text-white! text-sm underline self-start"
        >
          ← Back
        </button>
        <h1 className="flex items-center justify-center flex-wrap text-3xl! font-light! mb-1 gap-2 text-center">
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
            <p className="text-neutral-300 mb-8 text-lg! md:text-xl!">
              Create your artist profile, showcase your portfolio, and connect
              with local clients.
            </p>
            <GoogleSignupButton role="artist" />
            {/* Subtext */}
            <p className="text-xs! text-neutral-400! mt-2! max-w-[300px] mx-auto text-center">
              We only collect your name, profile picture, and email from Google
              to set up your account. By signing up, you agree to our{" "}
              <Link
                to="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white transition"
              >
                Terms
              </Link>
              .
            </p>
          </>
        )}

        {formVisible && (
          <form
            autoComplete="off"
            onSubmit={handleArtistSubmit}
            className="mt-10 space-y-4 text-left bg-[#121212] p-6 rounded-lg"
          >
            <h2 className="text-xl font-semibold text-white mb-2">
              {stepHeadings[currentStep]}
            </h2>

            {/* STEP 1: Basic Info */}
            {currentStep === 0 && (
              <>
                <div data-aos="fade-in">
                  <input
                    type="text"
                    name="displayName"
                    onChange={(e) => setDisplayName(e.target.value)}
                    value={displayName}
                    placeholder="Display Name (e.g. @inkbykai or DotQueen)"
                    required
                    className="w-full p-2 rounded bg-neutral-800 text-white mb-2"
                  />
                  <textarea
                    name="bio"
                    placeholder="Your Bio"
                    onChange={(e) => setBio(e.target.value)}
                    value={bio}
                    required
                    className="w-full p-2 rounded bg-neutral-800 text-white"
                  />
                  <select
                    name="shopId"
                    onChange={(e) => setShopId(e.target.value)}
                    value={shopId}
                    required
                    className="w-full p-2 rounded bg-neutral-800 text-white"
                  >
                    <option value="">Select Your Shop</option>
                    {shops.map((shop) => (
                      <option key={shop.id} value={shop.id}>
                        {shop.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* STEP 2: Specialties + Links */}
            {currentStep === 1 && (
              <>
                <div data-aos="fade-in">
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
                            checked={specialties.includes(style)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSpecialties((prev) => [...prev, style]);
                              } else {
                                setSpecialties((prev) =>
                                  prev.filter((s) => s !== style)
                                );
                              }
                            }}
                            required
                            value={style}
                            className="accent-red-600"
                          />
                          <span>{style}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3 mt-4">
                    <input
                      type="url"
                      name="instagram"
                      required
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="Instagram URL"
                      className="w-full p-2 rounded bg-neutral-800 text-white"
                    />
                    <input
                      type="url"
                      name="facebook"
                      onChange={(e) => setFacebook(e.target.value)}
                      required
                      value={facebook}
                      placeholder="Facebook URL"
                      className="w-full p-2 rounded bg-neutral-800 text-white"
                    />
                    <input
                      type="url"
                      name="website"
                      onChange={(e) => setWebsite(e.target.value)}
                      value={website}
                      required
                      placeholder="Website URL"
                      className="w-full p-2 rounded bg-neutral-800 text-white"
                    />
                  </div>
                </div>
              </>
            )}

            {/* STEP 3: Payment Method */}
            {currentStep === 2 && (
              <>
                <div data-aos="fade-in" className="space-y-2">
                  <label className="block text-sm font-medium text-white">
                    How would you like to accept payments?
                  </label>
                  <div className="flex flex-col space-y-1">
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="paymentType"
                        value="internal"
                        checked={paymentType === "internal"}
                        onChange={() => {
                          setPaymentType("internal");
                          setSelectedMethod("");
                        }}
                        className="accent-red-600"
                        required
                      />
                      <span>In-app with Stripe (recommended)</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="paymentType"
                        required
                        value="external"
                        checked={paymentType === "external"}
                        onChange={() => setPaymentType("external")}
                        className="accent-red-600"
                      />
                      <span>Externally (CashApp, Venmo, Zelle)</span>
                    </label>
                  </div>

                  {paymentType === "external" && (
                    <div className="space-y-3 mt-4">
                      <select
                        name="externalMethod"
                        value={selectedMethod}
                        onChange={(e) => setSelectedMethod(e.target.value)}
                        required
                        className="w-full p-2 rounded bg-neutral-800 text-white"
                      >
                        <option value="">
                          Select your preferred payment method
                        </option>
                        <option value="cashapp">CashApp</option>
                        <option value="venmo">Venmo</option>
                        <option value="zelle">Zelle</option>
                      </select>

                      {selectedMethod && (
                        <input
                          type="text"
                          name="externalHandle"
                          value={externalHandle}
                          onChange={(e) => setExternalHandle(e.target.value)}
                          required
                          placeholder={
                            selectedMethod === "zelle"
                              ? "Email or phone number"
                              : selectedMethod === "cashapp"
                              ? "$YourCashTag"
                              : "@yourusername or phone"
                          }
                          className="w-full p-2 rounded bg-neutral-800 text-white"
                        />
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* STEP 4: Deposit & Payment Timing */}
            {currentStep === 3 && (
              <div data-aos="fade-in">
                <input
                  type="number"
                  name="depositAmount"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  required
                  placeholder="Required deposit amount (e.g. 100)"
                  className="w-full p-2 rounded bg-neutral-800 text-white"
                  min={0}
                />
                <div className="space-y-1 mt-3">
                  <label className="text-sm font-medium text-white">
                    When do you prefer final payment?
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="finalPaymentTiming"
                      value="before"
                      checked={finalPaymentTiming === "before"}
                      onChange={(e) => setFinalPaymentTiming(e.target.value)}
                      className="accent-red-600"
                    />
                    <span>Before the session</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="finalPaymentTiming"
                      value="after"
                      checked={finalPaymentTiming === "after"}
                      onChange={(e) => setFinalPaymentTiming(e.target.value)}
                      className="accent-red-600"
                    />
                    <span>After the session</span>
                  </label>
                </div>
              </div>
            )}

            {/* STEP 5: Review/Submit */}
            {currentStep === 4 && (
              <p className="text-neutral-400 text-sm">
                You're all set! When you're ready, click the button below to
                submit your artist profile.
              </p>
            )}
            {readyToSubmit && submitting && (
              <p className="text-sm text-neutral-400 mb-2">
                Just a sec — saving your profile…
              </p>
            )}
            <div className="flex justify-between pt-6">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="text-white underline"
                >
                  ← Back
                </button>
              )}

              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep(currentStep + 1)}
                  className="bg-red-600 px-4 py-2 rounded text-white hover:bg-red-700"
                >
                  Next →
                </button>
              ) : (
                <button type="submit" disabled={!readyToSubmit || submitting}>
                  {submitting ? "Submitting..." : "Submit Profile"}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ArtistSignupPage;

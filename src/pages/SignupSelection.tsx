import { useNavigate } from "react-router-dom";

export default function SignupSelection() {
  const navigate = useNavigate();

  return (
    <div
      data-aos="fade-in"
      className="flex flex-col items-center justify-center h-screen text-white"
    >
      <h1 className="text-2xl text-center">Welcome!</h1>
      <h2 className="text-neutral-500! mb-10!">
        How will you be using this platform?
      </h2>
      <div className="flex gap-6">
        <button
          onClick={() => navigate("/signup/client")}
          className="px-6 py-3 text-white! hover:text-[#121212]! border-2 border-neutral-300 hover:bg-neutral-300 rounded"
        >
          Client
        </button>
        <button
          onClick={() => navigate("/signup/artist")}
          className=" px-6 py-3 text-white! hover:text-[#121212]! border-2 border-neutral-300 hover:bg-neutral-300 rounded"
        >
          Artist
        </button>
      </div>
    </div>
  );
}

import { useNavigate } from "react-router-dom";

export default function SignupSelection() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-screen text-white">
      <h1 className="text-2xl mb-4">Sign up as...</h1>
      <div className="flex gap-6">
        <button
          onClick={() => navigate("/signup/client")}
          className="bg-orange-500 px-6 py-3 rounded-md hover:bg-orange-600"
        >
          Client
        </button>
        <button
          onClick={() => navigate("/signup/artist")}
          className="bg-orange-500 px-6 py-3 rounded-md hover:bg-orange-600"
        >
          Artist
        </button>
      </div>
    </div>
  );
}

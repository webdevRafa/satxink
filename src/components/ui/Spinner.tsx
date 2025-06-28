type SpinnerProps = {
  className?: string;
};

const Spinner: React.FC<SpinnerProps> = ({ className = "" }) => {
  return (
    <div
      className={`animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-gray-900 mx-auto mt-10 ${className}`}
    />
  );
};

export default Spinner;

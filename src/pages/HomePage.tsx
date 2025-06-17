import { FeaturedArtists } from "../components/FeaturedArtists";
import { HeroSection } from "../components/HeroSection";
import { BrowseByStyle } from "../components/BrowseByStyle";
import { ClientPosts } from "../components/ClientPosts";
import { ArtistCTA } from "../components/ArtistCTA";

export const HomePage: React.FC = () => {
  return (
    <>
      <HeroSection />
      <FeaturedArtists />
      <BrowseByStyle />
      <ClientPosts />
      <ArtistCTA />
    </>
  );
};

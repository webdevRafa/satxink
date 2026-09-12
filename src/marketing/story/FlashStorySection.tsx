import { assetBase } from "./storyModel";
import type { Chapter } from "./storyModel";
import "./story.css";

const chapters = {
  collection: {
    id: "bring-work-online", next: "for-artists", number: "01", label: "Bring the work online",
    title: "Your artists create it. Give it a place to live.",
    note: "Your studio’s collection—not a shared directory of competing shops.",
    steps: [
      ["closed-portfolio", "Start with your artists.", "Invite your team. Each artist gets a profile and a workspace under your shop’s brand."],
      ["sheet-lift", "Start with the sheet.", "Upload a flash sheet and crop individual designs. Keep the collection together while giving each piece its own details."],
      ["extraction-start", "Every design, its own place.", "Add a price, placement notes, and availability. Distinguish one-of-one work from repeatable flash."],
      ["online-collection", "One collection. Ready to share.", "Publish your available flash and share artist profiles or sheet links from your website, Instagram bio, or messages."],
    ],
  },
  booking: {
    id: "how-it-works", next: "for-owners", number: "02", label: "Booking on your terms",
    title: "A request is just the beginning.",
    note: "Artist approval first. A time and deposit agreed together.",
    steps: [
      ["request", "Clients request the work.", "A design, a placement, a size, and preferred timing. The request gives the artist a starting point—not an automatic booking."],
      ["artist-review", "Artists decide what to take on.", "Review the request before moving forward. If the work isn’t a fit, you can decline. Your schedule stays in your hands."],
      ["artist-offer", "Offer the times that work for you.", "Set the deposit and send appointment options. The client chooses from the times you offer, not unrestricted access to your calendar."],
      ["deposit", "A time chosen. A deposit paid.", "The client chooses an offered time and pays the deposit through Stripe. The remaining tattoo balance is settled at the shop."],
    ],
  },
};

export function FlashStorySection({ chapter }: { chapter: Chapter }) {
  const data = chapters[chapter];
  return <section id={data.id} className="flash-story" data-chapter={chapter} aria-labelledby={`${data.id}-title`}>
    <div className="story-stage">
      <div className="shell story-inner">
        <div className="story-topline"><p className="eyebrow">{data.number} / {data.label}</p>
          <a className="story-skip" href={`#${data.next}`}>Skip animation <span aria-hidden="true">↘</span></a></div>
        <div className="story-body">
          <div className="story-copy">
            <h2 id={`${data.id}-title`}>{data.title}</h2>
            <ol className="story-steps">
              {data.steps.map(([pose, title, copy], i) => <li key={pose} data-step={i}>
                <picture className="story-still">
                  <source media="(max-width: 600px)" srcSet={`${assetBase}${pose}-480.webp`} />
                  <img src={`${assetBase}${pose}.webp`} alt="" width={960} height={720} loading="lazy" />
                </picture>
                <div className="story-step-copy"><span className="story-step-number">0{i + 1} / 04</span><h3>{title}</h3><p>{copy}</p></div>
              </li>)}
            </ol>
          </div>
          <div className="story-art" aria-hidden="true">
            <img className="story-poster" src={`${assetBase}${data.steps[0][0]}.webp`} width={960} height={720} alt="" loading="lazy" />
            <div className="story-canvas-host" />
            <span className="story-art-caption">The living flash portfolio / Workflow illustration</span>
          </div>
        </div>
        <div className="story-bottom"><p>{data.note}</p><div className="story-track" aria-hidden="true"><span /></div></div>
      </div>
    </div>
  </section>;
}

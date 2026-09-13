export type ContentSection = {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
};

export type ContentPage = {
  path: string;
  label: string;
  title: string;
  description: string;
  eyebrow: string;
  heading: string;
  intro: string;
  sections: ContentSection[];
  related: string[];
  presentation?: "flash" | "websites" | "pricing" | "guide";
};

export const contentPages: ContentPage[] = [
  {
    path: "/tattoo-shop-management-software",
    label: "Shop management",
    title: "Tattoo Shop Management Software | SATX INK",
    description: "Invite artists, manage shop hours and events, and connect your team’s flash and booking workflow with SATX INK tattoo shop management software.",
    eyebrow: "For tattoo shop owners",
    heading: "Your shop. Your artists. One connected system.",
    intro: "SATX INK brings your team, shop information and flash-booking tools together under your brand. Give artists their own workspace while you manage the details that keep the shop’s website current.",
    sections: [
      { id: "invite-artists", heading: "Invite your artists and give their work a home.", paragraphs: [
        "Start with your team. Send artists invitations to set up their profiles and add their work. Each artist gets a place for their portfolio and available flash, plus a profile link they can share with clients.",
        "Owners manage team members and assign artists to studio locations. Artists manage their own designs, prices, requests and appointment offers. This gives clients a connected shop experience while keeping the artist involved in the booking decision.",
      ] },
      { id: "shop-details", heading: "Keep hours, events and shop information current.", paragraphs: [
        "Update store hours and supported shop content from the owner dashboard. Publish events and announcements with images, dates and location details so visitors can see what is happening at your shop.",
        "On a SATX INK website, you can update supported text, images and branding. If you choose a companion portal, your existing website remains with its current provider; you continue editing that website there.",
      ], bullets: ["Manage artist invitations and team details.", "Maintain shop information and store hours.", "Publish events, announcements and promotions.", "Update supported website or portal branding."] },
      { id: "booking-workflow", heading: "Keep artists in control of booking requests.", paragraphs: [
        "Clients browse available flash and send a request with details such as placement, size and preferred timing. The artist reviews it, then sends an offer with a deposit and appointment options if the request is a fit.",
        "The client chooses an offered time and pays the deposit through Stripe. The remaining tattoo balance is settled at the shop. Artists connect their own Stripe accounts; this is an approval-based workflow, not unrestricted access to an artist’s calendar.",
      ] },
      { id: "client-updates", heading: "Stay in touch with clients who opt in.", paragraphs: [
        "Clients can choose to receive your emails when they sign up. Those who opt in are added to your mailing list, so you can prepare shop announcements and promotions from the dashboard.",
        "Use that connection to share an upcoming event or a new flash collection. Keep the message specific and link directly to the relevant collection so clients can find the work you are talking about.",
      ] },
      { id: "owner-setup", heading: "Start with your shop’s actual setup.", paragraphs: [
        "Bring your current website address, number of artists and locations, and the parts of your workflow you want to connect. We’ll walk through the owner, artist and client experiences and discuss whether a full website or companion portal fits.",
        "The initial launch is for Texas tattoo shops on September 20, 2026. Installation requirements and timing are discussed with each shop before setup.",
      ] },
    ],
    related: ["/tattoo-flash-booking-software", "/tattoo-shop-websites", "/pricing"],
  },
  {
    path: "/tattoo-flash-booking-software",
    label: "Flash booking",
    title: "Tattoo Flash Booking Software for Artists | SATX INK",
    description: "Publish tattoo flash sheets and individual designs, schedule drops, review requests and collect Stripe deposits with SATX INK flash booking software.",
    eyebrow: "From available flash to an accepted offer",
    heading: "Give every flash design a path to a booking.",
    intro: "Bring your artists’ available work onto your shop’s website or portal. Clients explore the designs, artists review the requests, and accepted offers lead to an appointment and deposit.",
    presentation: "flash",
    sections: [
      { id: "publish-flash", heading: "Upload a single design or a complete flash sheet.", paragraphs: [
        "Artists can publish individual flash or upload a sheet and crop its designs. Add the details clients need to understand the work before requesting it, including the design’s price and whether it is repeatable.",
        "Clients can explore the whole sheet or browse individual designs. The sheet has its own shareable link, while the artist’s profile brings their portfolio and available flash together.",
      ] },
      { id: "plan-drops", heading: "Publish now, or plan a flash drop.", paragraphs: [
        "Build a collection ahead of time and schedule its release. Clients can preview an upcoming drop; prices and requests open when the drop launches. Share the sheet’s link from your website, an Instagram bio or a message.",
        "Mark one-of-one designs separately from repeatable flash. Holds and sold states help manage availability as clients move through the offer and deposit workflow.",
      ] },
      { id: "request-to-booking", heading: "Four steps from browsing to booking.", paragraphs: [
        "An available design starts a conversation with the artist. Sending a request does not automatically reserve an appointment or complete a tattoo booking.",
      ], bullets: [
        "Request: the client shares the design, placement, size and preferred timing.",
        "Review: the artist decides whether the request is a fit and can decline it.",
        "Offer: the artist sets a deposit and proposes appointment options.",
        "Accept: the client chooses an offered time and pays the deposit through Stripe.",
      ] },
      { id: "stripe-deposits", heading: "Artist Stripe accounts, client deposits.", paragraphs: [
        "Each artist connects their own Stripe account to receive payments for accepted booking offers. Account onboarding is required. Stripe handles payment processing and payouts, and payout timing depends on the artist’s account.",
        "The client pays a deposit online and settles the remaining tattoo balance at the shop. Checkout displays the payment breakdown and applicable service fee. A paid deposit and a Stripe payout are different steps; connecting an account does not promise instant payouts.",
      ] },
      { id: "share-profile", heading: "Make the artist’s profile the next stop.", paragraphs: [
        "Give clients one link to find the artist’s portfolio and available designs. A full website might use yourshop.com/artistname; a companion portal uses the portal’s domain. These are examples of the two setups, not separate marketplace listings.",
        "Try the demo to follow the browsing experience, then request a walkthrough to see how the artist workspace supports it. The system works in a browser on phone or desktop without a native app download.",
      ] },
    ],
    related: ["/guides/launch-a-tattoo-flash-drop", "/tattoo-shop-management-software", "/pricing"],
  },
  {
    path: "/tattoo-shop-websites",
    label: "Websites & portals",
    title: "Tattoo Shop Websites & Branded Booking Portals | SATX INK",
    description: "Get a tattoo shop website with artist profiles and flash booking, or keep your current website and add a branded SATX INK companion portal.",
    eyebrow: "Two ways to bring your shop online",
    heading: "A new tattoo shop website. Or tools alongside the one you love.",
    intro: "Choose a full shop website with SATX INK tools, or a separately configured companion portal linked from your existing site. Both connect artists, available flash and booking requests under your shop’s brand.",
    presentation: "websites",
    sections: [
      { id: "full-website", heading: "Start fresh with a shop website and booking tools.", paragraphs: [
        "A full SATX INK website puts your shop information, artist profiles, portfolios and available flash under your domain. Clients can move from discovering an artist to requesting a design within the same branded experience.",
        "Owner, artist and client dashboards are included. The owner manages supported website content and branding, while artists publish work and handle their requests. Discuss your domain and existing site with us before planning a move.",
      ] },
      { id: "companion-portal", heading: "Keep your website and add a companion portal.", paragraphs: [
        "Your current website stays with its existing provider. We configure a separate shop-branded portal, normally on a subdomain such as portal.yourshop.com, for artist profiles, available flash and the booking tools.",
        "Add clear links such as Browse flash or Artist login to your existing site. They open the portal. You keep editing your original website with its current tools; SATX INK manages the connected experience inside the portal.",
        "A companion portal is not an embedded plugin or a shared-login integration with your existing site. We’ll review the connection and domain setup with you so visitors know where each link leads.",
      ] },
      { id: "client-experience", heading: "Keep the booking experience consistent.", paragraphs: [
        "Whichever setup you choose, clients browse your artists’ work and send requests. Artists review the details and offer appointment times before clients accept and pay a deposit.",
        "A full website and a portal use the same approval-based approach. The choice is about where your public website lives and how clients reach your SATX INK tools.",
      ] },
      { id: "prepare-website", heading: "What to bring to your walkthrough.", paragraphs: [
        "Share your current website address and whether you want to keep it. We’ll discuss your domain, branding, artists, locations and payment setup before agreeing on installation details.",
      ], bullets: ["Your current site and domain provider, if you have them.", "Your logo, shop details and the content you want to publish.", "The artists and locations you want to set up.", "Questions about invitations, Stripe onboarding and ongoing support."] },
    ],
    related: ["/tattoo-shop-management-software", "/tattoo-flash-booking-software", "/pricing"],
  },
  {
    path: "/pricing",
    label: "Pricing & support",
    title: "Tattoo Shop Software Pricing & Support | SATX INK",
    description: "SATX INK costs $500 to set up and $100 per month for hosting and developer support. See included tools, additional operating costs and setup options.",
    eyebrow: "Setup, hosting and direct support",
    heading: "Know what goes into your shop’s system.",
    intro: "A full website or a branded portal starts with the same published setup and support fees. Review what is included and the separate operating costs before choosing your shop’s installation.",
    presentation: "pricing",
    sections: [
      { id: "additional-costs", heading: "Allow for the services your shop uses.", paragraphs: [
        "Database usage and email delivery are additional costs paid by your shop. The amount depends on usage; those charges are not included in the $100 monthly hosting and support fee.",
        "Payment features require Stripe to be configured. Stripe processing costs and the applicable checkout service fee are separate from SATX INK’s setup and monthly support pricing. Review the payment breakdown and account terms during setup.",
        "We’ll discuss your expected usage and third-party setup before installation. This page does not quote a fixed all-inclusive operating cost for every shop.",
      ] },
      { id: "support-scope", heading: "Work directly with the developer.", paragraphs: [
        "The monthly fee includes hosting, direct developer support, and requested fixes or changes for your setup. Bring your needs to the walkthrough so we can discuss the installation and the work involved.",
        "If you need a particular turnaround time, migration, custom integration or other project requirement, discuss it before setup. Installation details and agreements are confirmed separately; a demo inquiry does not create a subscription or purchase.",
      ] },
      { id: "choose-setup", heading: "The same published fees for either setup.", paragraphs: [
        "Choose a new shop website if you want the public site and booking tools together. Choose a companion portal if you want to keep your existing website and add links to the SATX INK experience.",
        "Share your shop name, current website, number of artists and locations, and the setup you are considering. We’ll walk through the tools before discussing installation timing.",
      ] },
    ],
    related: ["/tattoo-shop-websites", "/texas", "/about"],
  },
  {
    path: "/texas",
    label: "Texas launch",
    title: "Tattoo Shop Software in Texas | September 20 Launch | SATX INK",
    description: "SATX INK launches for Texas tattoo shops on September 20, 2026. Explore the software, compare website and portal options, and request a shop walkthrough.",
    eyebrow: "Texas launch · September 20, 2026",
    heading: "Starting with tattoo shops in Texas.",
    intro: "SATX INK’s official Texas launch is September 20, 2026. Explore the demo and talk through your shop’s website, artist team and flash-booking workflow before planning your installation.",
    sections: [
      { id: "texas-shops", heading: "For owners bringing their artists’ work together.", paragraphs: [
        "The initial launch focuses on tattoo shops in Texas. If you manage a team and want your shop’s available flash, artist profiles and booking requests connected under your brand, the walkthrough is a place to start.",
        "Tell us where your shop is based, how many artists and locations you manage, and whether you already have a website. We’ll discuss the setup that fits those details. The launch date announces the service; each shop’s installation timing is confirmed individually.",
      ] },
      { id: "launch-tools", heading: "What you can bring to your shop.", paragraphs: [
        "Owners invite artists and manage supported shop content, hours and events. Artists upload individual flash or complete sheets, publish available designs, and review client requests before offering appointments.",
        "Artists connect their own Stripe accounts for payments. Clients choose from the appointment options in an offer and pay a deposit online, then settle the remaining tattoo balance at the shop.",
      ] },
      { id: "texas-onboarding", heading: "From a walkthrough to your own setup.", paragraphs: [
        "First, explore the demo to get familiar with the client experience. Then request a walkthrough of the artist and owner tools and share the workflow you want to improve.",
        "Next, choose a full website or companion portal. We’ll review your domain, branding, team and third-party setup, including payments, before confirming installation requirements and timing.",
      ], bullets: ["Explore the demo without creating an account to browse.", "Send your shop’s website, Texas location and team size.", "Review the $500 setup and $100/month support pricing, plus additional operating costs.", "Agree on the installation details for your shop."] },
      { id: "outside-texas", heading: "Planning ahead from outside Texas?", paragraphs: [
        "The announced launch is focused on Texas. You can email support@satxink.com to ask about future availability, but we have not published a rollout date for other states.",
        "Looking to book a tattoo instead? Contact your tattoo shop or artist directly. SATX INK’s main website introduces the software to shop owners; it does not book tattoo appointments.",
      ] },
    ],
    related: ["/tattoo-shop-management-software", "/tattoo-shop-websites", "/pricing"],
  },
  {
    path: "/about",
    label: "About SATX INK",
    title: "About SATX INK | Software for Tattoo Shops",
    description: "Meet the idea behind SATX INK: shop-branded websites and software connecting artists, flash, requests and deposits, with direct developer support.",
    eyebrow: "Built around the work",
    heading: "A connected system for the shop behind the artwork.",
    intro: "SATX INK is a software provider for tattoo shops. It brings together the public website or portal, the artist’s workspace and the owner’s tools, with setup and direct developer support.",
    sections: [
      { id: "why-connected", heading: "The design is only the beginning.", paragraphs: [
        "A piece of flash leads to questions about placement, size, timing and price. SATX INK connects those steps: clients find the work, artists review the request, and accepted offers bring appointment choices and deposits into the same workflow.",
        "The shop’s identity stays central. Artists have their own profiles and workspaces, and owners manage the team and supported shop content. The website and tools are individually installed and configured for the shop.",
      ] },
      { id: "artist-control", heading: "Artists make the booking decisions.", paragraphs: [
        "Publishing a design does not mean accepting every request. Artists decide which requests fit, set their offers and provide appointment options. Clients choose from those options before paying a deposit.",
        "Artists also choose how to present their work: individual designs, full flash sheets, scheduled drops and one-of-one pieces. Their shareable profile connects the portfolio with what is available to request.",
      ] },
      { id: "direct-support", heading: "A conversation with the developer behind the system.", paragraphs: [
        "Setup and ongoing support are part of the offer. Work directly with the developer to discuss your shop’s requirements, configure the installation and request fixes or changes for your setup.",
        "The published pricing is $500 for setup and $100 per month for hosting and developer support. Database usage and email delivery are additional costs. Review the pricing page for scope and bring specific requirements to the walkthrough.",
      ] },
      { id: "where-we-start", heading: "Texas first.", paragraphs: [
        "The official launch for Texas tattoo shops is September 20, 2026. You can browse the demo and request a walkthrough now. Installation details and timing are discussed with each shop.",
        "For product, setup or support questions, contact support@satxink.com. If you are a tattoo client looking for an appointment, contact your shop or artist directly.",
      ] },
    ],
    related: ["/texas", "/tattoo-flash-booking-software", "/pricing"],
  },
  {
    path: "/guides/launch-a-tattoo-flash-drop",
    label: "Flash drop guide",
    title: "How to Launch a Tattoo Flash Drop | SATX INK Guide",
    description: "Plan a tattoo flash drop with SATX INK: prepare designs, choose repeatability, schedule a sheet, share its link, review requests and send booking offers.",
    eyebrow: "A practical guide for artists and owners",
    heading: "How to launch a tattoo flash drop.",
    intro: "A flash drop works best when clients can find the collection and understand the next step. Use this walkthrough to prepare the work, publish it in SATX INK and handle the requests that follow.",
    presentation: "guide",
    sections: [
      { id: "prepare-artwork", heading: "Prepare the sheet and individual designs.", paragraphs: [
        "Choose the designs you want to release together. Use a clear image of the sheet, leave enough space around each design to crop it, and check that the linework is readable on a phone.",
        "Upload the sheet and crop its individual designs in your artist workspace. You can also publish individual flash when a design does not belong to a collection. Give each design enough information for clients to understand what they are requesting.",
      ] },
      { id: "set-details", heading: "Decide what is repeatable and what is one-of-one.", paragraphs: [
        "Review each design’s details and price before sharing it. Mark work intended to be tattooed only once separately from repeatable flash. This distinction matters when several clients are interested in the same piece.",
        "Decide how you will explain size, placement and any questions you need a client to answer. A clear design description gives you a better starting point when the request arrives.",
      ] },
      { id: "schedule-release", heading: "Choose a release time and review the collection.", paragraphs: [
        "Publish when the collection is ready, or schedule a drop for later. An upcoming drop can be previewed; prices and requests open at launch. Check the displayed release details before announcing the drop.",
        "Open the collection as a visitor and review the artwork and text. Make sure the date and time in your announcement agree with the details clients will see on the sheet.",
      ] },
      { id: "share-link", heading: "Share the sheet’s direct link.", paragraphs: [
        "Use the collection’s own link in your announcement so people arrive at the designs you are discussing. Your artist profile link is useful when you want clients to explore your portfolio and all available work.",
        "Tell clients when the drop opens, which artist is offering it and that sending a request starts the review process. If the shop sends an email announcement, send it to clients who opted in to those messages.",
      ] },
      { id: "review-requests", heading: "Review requests before offering appointments.", paragraphs: [
        "Read the client’s preferred placement, size and timing. If the request is a fit, prepare an offer with a deposit and appointment options. Decline requests that do not fit the work or your availability.",
        "The client chooses an offered time and pays the deposit through Stripe. Make sure your artist Stripe account has completed onboarding before relying on the payment workflow. The remaining tattoo balance is settled at the shop.",
      ] },
      { id: "follow-up", heading: "Keep availability and client expectations clear.", paragraphs: [
        "Review booking activity after the drop. For one-of-one designs, pay attention to the hold and sold states as clients move through the offer and deposit process. Keep repeatable work clearly identified.",
        "A request is not an automatic booking. Keep your client communication aligned with the offer, selected appointment and payment state, then use what you learn to prepare the next collection.",
      ], bullets: ["Clear artwork and design details.", "Repeatability checked for each design.", "Release details reviewed before promotion.", "The correct sheet link in every announcement.", "Stripe onboarding completed and time set aside to review requests."] },
    ],
    related: ["/tattoo-flash-booking-software", "/tattoo-shop-management-software", "/pricing"],
  },
];

// Card photos for the hand-written guides (Unsplash Licence: free for commercial use, no
// attribution required). Feed articles without one fall back to their illustrated cover.
import type { StaticImageData } from "next/image";
import workInjury from "../../public/images/blogs/work-injury-compensation.jpg";
import foreignWorker from "../../public/images/blogs/foreign-worker-insurance.jpg";
import publicLiability from "../../public/images/blogs/public-liability.jpg";
import professionalIndemnity from "../../public/images/blogs/professional-indemnity.jpg";
import directors from "../../public/images/blogs/directors-and-officers.jpg";
import property from "../../public/images/blogs/property-and-business-interruption.jpg";

export const blogPhotos: Record<string, StaticImageData> = {
  "work-injury-compensation": workInjury,
  "foreign-worker-insurance": foreignWorker,
  "public-liability": publicLiability,
  "professional-indemnity": professionalIndemnity,
  "directors-and-officers": directors,
  "property-and-business-interruption": property,
};

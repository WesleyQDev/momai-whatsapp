import "./index.css";
import { Composition } from "remotion";
import { MomAIPromoComposition } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MomAI-Promo-0-9-vs-1-2"
        component={MomAIPromoComposition}
        durationInFrames={540}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  );
};

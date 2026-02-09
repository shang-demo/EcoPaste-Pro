import { type CSSProperties, type FC } from "react";
import { useSnapshot } from "valtio";
import LocalImage from "@/components/LocalImage";
import { clipboardStore } from "@/stores/clipboard";
import type { DatabaseSchemaHistory } from "@/types/database";

interface ImageProps extends DatabaseSchemaHistory<"image"> {
  expanded?: boolean;
}

const Image: FC<ImageProps> = (props) => {
  const { value, expanded } = props;
  const { content } = useSnapshot(clipboardStore);

  const imageDisplayHeight = content.imageDisplayHeight || 100;

  const getImageStyle = (): CSSProperties => {
    if (expanded) {
      return {
        maxHeight: "none",
        width: "100%",
        objectFit: "contain",
      };
    }
    return {
      maxHeight: `${imageDisplayHeight}px`,
    };
  };

  return <LocalImage style={getImageStyle()} src={value} />;
};

export default Image;

import { convertFileSrc } from "@tauri-apps/api/core";
import { forwardRef, type ImgHTMLAttributes } from "react";

interface LocalImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

const LocalImage = forwardRef<HTMLImageElement, LocalImageProps>(
  (props, ref) => {
    const { src, ...rest } = props;

    return <img ref={ref} {...rest} loading="lazy" src={convertFileSrc(src)} />;
  },
);

LocalImage.displayName = "LocalImage";

export default LocalImage;

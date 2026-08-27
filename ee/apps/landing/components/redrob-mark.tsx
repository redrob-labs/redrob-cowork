import Image from "next/image";

type Props = {
  className?: string;
};

export function RedrobWorkMark(props: Props) {
  return (
    <Image
      src="/redrob-mark.svg"
      alt=""
      aria-hidden="true"
      className={props.className}
      width={834}
      height={649}
      unoptimized
    />
  );
}

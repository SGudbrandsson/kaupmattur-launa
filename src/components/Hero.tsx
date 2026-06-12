import { copy } from "../copy";

export function Hero() {
  const { kicker, title, titleAccent, lead } = copy.hero;
  const [before, after] = title.split(titleAccent);
  return (
    <section class="hero rise">
      <span class="kicker">{kicker}</span>
      <h1>
        {before}
        <em>{titleAccent}</em>
        {after}
      </h1>
      <p class="lead">{lead}</p>
    </section>
  );
}

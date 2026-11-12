type GreetingProps = { name: string }

export function Greeting({ name }: GreetingProps) {
  return <p>{name}</p>
}

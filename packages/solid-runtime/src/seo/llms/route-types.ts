type LlmsRouteOptions = {
  section?: string
  optional?: boolean
}

// true includes the page with inherited selection fields, false excludes it,
// and an object includes the page while overriding only the declared fields.
export type LlmsRouteInfo = boolean | LlmsRouteOptions

/**
 * HTTP surface of the control plane. Only the Convex Auth routes live here:
 * the gateway talks to Convex over the client protocol by function reference,
 * never over a bespoke HTTP endpoint.
 */
import { httpRouter } from "convex/server"
import { auth } from "./auth"

const http = httpRouter()

auth.addHttpRoutes(http)

export default http

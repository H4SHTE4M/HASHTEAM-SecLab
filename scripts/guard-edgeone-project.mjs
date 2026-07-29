// Loaded into the EdgeOne CLI process through NODE_OPTIONS. The upstream CLI
// auto-creates a Direct Upload project when its name lookup returns nothing;
// production CI must instead fail closed and stay bound to the reviewed ID.
const CHINA_API_ORIGIN = 'https://pages-api.cloud.tencent.com'
const GLOBAL_API_ORIGIN = 'https://pages-api.edgeone.ai'
const expectedName = process.env.EDGEONE_PROJECT_NAME
const expectedId = process.env.EDGEONE_PROJECT_ID
const originalFetch = globalThis.fetch

if (typeof originalFetch !== 'function') {
  throw new Error('EdgeOne project guard requires the Node.js fetch API')
}
if (!/^[A-Za-z0-9_-]{1,64}$/.test(expectedName ?? '')) {
  throw new Error('EdgeOne project guard received an invalid project name')
}
if (!/^makers-[a-z0-9]+$/.test(expectedId ?? '')) {
  throw new Error('EdgeOne project guard received an invalid project ID')
}

globalThis.fetch = async function guardedEdgeOneFetch(input, init) {
  const requestUrl = new URL(
    typeof input === 'string' || input instanceof URL ? input : input.url,
  )
  const isPagesApi = requestUrl.pathname === '/v1'
  if (isPagesApi && requestUrl.origin === GLOBAL_API_ORIGIN) {
    throw new Error('EdgeOne production CI forbids fallback to the Global API')
  }
  if (!isPagesApi || requestUrl.origin !== CHINA_API_ORIGIN) {
    return originalFetch.call(this, input, init)
  }

  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET'))
    .toUpperCase()
  if (method !== 'POST' || typeof init?.body !== 'string') {
    throw new Error('EdgeOne production CI received an unexpected API request')
  }

  let requestBody
  try {
    requestBody = JSON.parse(init.body)
  } catch {
    throw new Error('EdgeOne production CI received a non-JSON API request')
  }
  if (requestBody.Action === 'CreatePagesProject') {
    throw new Error(
      `EdgeOne production CI refuses to auto-create project ${expectedName}`,
    )
  }

  const response = await originalFetch.call(this, input, init)
  const nameFilter = requestBody.Filters?.find(
    (filter) =>
      filter?.Name === 'Name' &&
      Array.isArray(filter.Values) &&
      filter.Values.includes(expectedName),
  )
  if (requestBody.Action !== 'DescribePagesProjects' || !nameFilter) {
    return response
  }

  let payload
  try {
    payload = await response.clone().json()
  } catch {
    throw new Error('EdgeOne project guard could not parse the project query')
  }
  const result = payload?.Data?.Response ?? payload?.Response ?? payload
  const projects = result?.Projects
  const matches = Array.isArray(projects)
    ? projects.filter((project) => project?.Name === expectedName)
    : []
  if (
    !response.ok ||
    payload?.Code !== 0 ||
    matches.length !== 1 ||
    matches[0].ProjectId !== expectedId ||
    matches[0].Provider !== 'Upload'
  ) {
    throw new Error(
      `EdgeOne project guard rejected ${expectedName}: expected ${expectedId} Direct Upload`,
    )
  }
  return response
}

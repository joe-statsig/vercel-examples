import { GetStaticPaths, GetStaticProps } from 'next'
import { useRouter } from 'next/router'
import StatsigNode from 'statsig-node'
import { Statsig } from 'statsig-react'
import Image from 'next/image'
import Cookie from 'js-cookie'
import {
  Layout,
  Text,
  Page,
  Button,
  Link,
  Snippet,
  Code,
} from '@vercel/examples-ui'
import { UID_COOKIE, GROUP_PARAM_FALLBACK } from '../lib/constants'
import { AdapterResponse, IDataAdapter } from 'statsig-node'
import { createClient, EdgeConfigClient } from '@vercel/edge-config'
import exampleScreenshot from '../public/example_experiment.png'

interface Props {
  bucket: string
}

class EdgeConfigDataAdapter implements IDataAdapter {
  private configSpecsKey: string
  private edgeConfigClient: EdgeConfigClient
  private supportConfigSpecPolling: boolean = false

  public constructor(
    key: string,
    connectionString: string = process.env.EDGE_CONFIG!
  ) {
    this.configSpecsKey = key
    this.edgeConfigClient = createClient(connectionString)
  }

  public async get(key: string): Promise<AdapterResponse> {
    if (key !== 'statsig.cache') {
      return {
        error: new Error(`Edge Config Adapter Only Supports Config Specs`),
      }
    }

    const data = await this.edgeConfigClient.get(this.configSpecsKey)
    if (data === undefined) {
      return { error: new Error(`key (${key}) does not exist`) }
    }
    return { result: JSON.stringify(data) }
  }

  public async set(
    key: string,
    value: string,
    time?: number | undefined
  ): Promise<void> {
    // no-op. Statsig's Edge Config integration keeps config specs synced through Statsig's service
  }

  public async initialize(): Promise<void> {
    const data = await this.edgeConfigClient.get(this.configSpecsKey)

    if (data) {
      this.supportConfigSpecPolling = true
    }
  }

  public async shutdown(): Promise<void> {}

  public supportsPollingUpdatesFor(key: string): boolean {
    console.log(key)
    if (key === 'statsig.cache') {
      return this.supportConfigSpecPolling
    }
    return true
  }
}

export async function getServerSideProps(context: unknown) {
  const startT = new Date().valueOf()

  const dataAdapter = new EdgeConfigDataAdapter(
    process.env.EDGE_CONFIG_ITEM_KEY!
  )

  await StatsigNode.initialize(process.env.STATSIG_SERVER_API_KEY!, {
    dataAdapter,
  })

  const bucket = (
    await StatsigNode.getConfig({ userID: '1234' }, 'statsig_example')
  ).getValue('bucket', 'default')

  console.log(bucket)

  const endT1 = new Date().valueOf()

  console.log(`init time: ${endT1 - startT}`)

  StatsigNode.flush()

  return {
    props: {}, // will be passed to the page component as props
  }
}

function BucketPage({ bucket }: Props) {
  const { reload } = useRouter()

  function resetBucket() {
    Cookie.remove(UID_COOKIE)
    Statsig.logEvent('reset-bucket')
    reload()
  }

  return (
    <Page className="flex flex-col gap-12">
      <section className="flex flex-col gap-6">
        <Text variant="h1">Performant experimentation with Statsig</Text>
        <Text>
          In this demo we use Statsig&apos;s Server SDK at the edge to pull
          experiment variants and show the resulting allocation. We leverage the{' '}
          <Link href="https://vercel.com/integrations/statsig" target="_blank">
            edge config integration
          </Link>{' '}
          to pull Statsig configurations from the edge. As long as you have a
          bucket assigned you will always see the same result, otherwise you
          will be assigned a bucket to mantain the odds specified in the
          experiment.
        </Text>
        <Text>
          Buckets are statically generated at build time in a{' '}
          <Code>/[bucket]</Code> page so its fast to rewrite to them. Take a
          look at the <Code>middleware.ts</Code> file to know more.
        </Text>
        <Text>
          You can reset the bucket multiple times to get a different bucket
          assigned. You can configure your experiments, see diagnostics and
          results in your account.{' '}
          <Link href="https://console.statsig.com/" target="_blank">
            Statsig console
          </Link>
          .
        </Text>
        <pre className="bg-black text-white font-mono text-left py-2 px-4 rounded-lg text-sm leading-6">
          bucket:{' '}
          {bucket === GROUP_PARAM_FALLBACK
            ? 'Experiment not set up, please read README to set up example.'
            : bucket}
        </pre>
        <Button size="lg" onClick={resetBucket}>
          Reset bucket
        </Button>
        <Text>
          In order to set this demo up yourself, in the{' '}
          <Link href="https://console.statsig.com/" target="_blank">
            Statsig console
          </Link>
          , create a new experiment called &quot;statsig_example&quot;. Create
          experiment groups, each with a &quot;bucket&quot; parameter. Make sure
          to start the experiment, and from there this example will display the
          bucket that the user was assigned to. See the screenshot below for an
          example experiment setup.
        </Text>
        <Image src={exampleScreenshot} alt="Example Statsig Experiment Setup" />
      </section>

      <section className="flex flex-col gap-6">
        <Text variant="h2">Using metrics in your experiments</Text>
        <Text>
          <Link href="https://docs.statsig.com/metrics" target="_blank">
            Statsig Metrics
          </Link>{' '}
          are a way to track events that happen in your site. One way to enable
          them is to pass the <Code>StatsigProvider</Code> to{' '}
          <Link
            href="https://nextjs.org/docs/advanced-features/custom-app"
            target="_blank"
          >
            <Code>_app.tsx</Code>
          </Link>
          .
        </Text>
        <Snippet>{`import Cookies from 'js-cookie'
import { StatsigProvider } from 'statsig-react'

function App({ Component, pageProps }) {
  const Layout = getLayout(Component)

  // middleware will automatically set a cookie for the user if they visit a page
  const userID = Cookies.get(UID_COOKIE)

  return (
    <StatsigProvider
      sdkKey={process.env.NEXT_PUBLIC_STATSIG_CLIENT_KEY!}
      waitForInitialization={true}
      user={{ userID }}
    >
      <Layout title="statsig-metric" path="solutions/statsig-metric">
        <Component {...pageProps} />
      </Layout>
    </StatsigProvider>
  )
}`}</Snippet>
        <Text>
          Now we can tracks events by calling using the{' '}
          <Code>Statsig.logEvent</Code> function to track events during your
          experiments.
        </Text>
        <Snippet>{`import { Statsig } from 'statsig-react';

...

export default function MyComponent() {
  return
    <Button
      onClick={() => {
        // this can be any event like adding an item to a cart or clicking a CTA button.
        Statsig.logEvent('button_clicked');
      }}
    />;
}`}</Snippet>
      </section>
    </Page>
  )
}

BucketPage.Layout = Layout

export default BucketPage

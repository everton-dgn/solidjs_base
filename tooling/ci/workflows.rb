require 'json'
require 'yaml'

names = JSON.parse(File.read('packages/create-solid/tooling/scenarios.json')).map { |entry| entry.fetch('name') }
%w[ci release].each do |name|
  workflow = YAML.safe_load(File.read(".github/workflows/#{name}.yml"))
  actual = workflow.fetch('jobs').fetch('scenario').fetch('strategy').fetch('matrix').fetch('scenario')
  raise "#{name} scenario matrix differs from the generator" unless actual == names
end

ci = YAML.safe_load(File.read('.github/workflows/ci.yml')).fetch('jobs')
raise 'CI required must depend on every other job' unless ci.fetch('required').fetch('needs').sort == (ci.keys - ['required']).sort
%w[app app-e2e].each do |name|
  build = ci.fetch(name).fetch('steps').find { |step| step['name'] == 'Build the packages' }.fetch('run')
  expected = %w[vp run --fail-if-no-match --filter @evertondgn/solid-tooling --filter @evertondgn/vite-plugin-solid-icons build]
  raise "#{name} must build its two presets" unless build.split == expected
end

release = YAML.safe_load(File.read('.github/workflows/release.yml')).fetch('jobs')
raise 'Publication must wait for verification and installations' unless release.fetch('publish').fetch('needs').sort == %w[release-please verified] && release.fetch('verified').fetch('needs').sort == %w[scenario verify]
validations = release.flat_map do |name, job|
  job.fetch('steps').map { |step| name if step.fetch('run', '').lines.map(&:strip).include?('vp run validate') }.compact
end
raise 'Validate once before publishing' unless validations == ['verify']

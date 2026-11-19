require 'json'
require 'yaml'

names = JSON.parse(File.read('packages/create-solid/tooling/scenarios.json')).map { |entry| entry.fetch('name') }
%w[ci release].each do |name|
  workflow = YAML.safe_load(File.read(".github/workflows/#{name}.yml"))
  actual = workflow.fetch('jobs').fetch('scenario').fetch('strategy').fetch('matrix').fetch('scenario')
  raise "#{name} scenario matrix differs from the generator" unless actual == names
end

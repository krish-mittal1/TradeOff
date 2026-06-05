provider "aws" { region = var.region }

module "networking" {
  source      = "./modules/networking"
  environment = var.environment
  vpc_cidr    = var.vpc_cidr
}

module "database" {
  source             = "./modules/database"
  environment        = var.environment
  private_subnet_ids = module.networking.private_subnet_ids
  vpc_id             = module.networking.vpc_id
}

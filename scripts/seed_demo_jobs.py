"""
Script to seed 50 realistic remote software engineering jobs into WorkMesh AI database.
"""

import asyncio
import uuid
import random
from datetime import datetime, timezone

# Realistic demo jobs dataset
TITLES = [
    "Senior React & TypeScript Engineer",
    "Python Backend Architect (FastAPI / Django)",
    "AI / Machine Learning Infrastructure Engineer",
    "Staff DevOps Engineer (AWS & Kubernetes)",
    "Data Platform Engineer (Snowflake & Spark)",
    "Full Stack Engineer (Next.js & Node.js)",
    "Lead Go Systems Developer",
    "Rust Distributed Systems Engineer",
    "Senior Android / Mobile Engineer (Kotlin)",
    "iOS Tech Lead (Swift & SwiftUI)",
    "Principal Security & Compliance Engineer",
    "Site Reliability Engineer (SRE)",
    "AI Agent & LLM Applications Developer",
    "Senior GraphQL API Architect",
    "Cloud Infrastructure Automation Lead",
]

COMPANIES = [
    ("Stripe", "https://logo.clearbit.com/stripe.com"),
    ("Vercel", "https://logo.clearbit.com/vercel.com"),
    ("Datadog", "https://logo.clearbit.com/datadoghq.com"),
    ("Linear", "https://logo.clearbit.com/linear.app"),
    ("Supabase", "https://logo.clearbit.com/supabase.com"),
    ("OpenAI", "https://logo.clearbit.com/openai.com"),
    ("Anthropic", "https://logo.clearbit.com/anthropic.com"),
    ("Cloudflare", "https://logo.clearbit.com/cloudflare.com"),
    ("Retool", "https://logo.clearbit.com/retool.com"),
    ("Postman", "https://logo.clearbit.com/postman.com"),
]

SKILL_SETS = [
    ["React", "TypeScript", "Next.js", "TailwindCSS", "GraphQL"],
    ["Python", "FastAPI", "PostgreSQL", "Redis", "Docker"],
    ["Python", "PyTorch", "LLM", "LangChain", "Vector DB"],
    ["AWS", "Kubernetes", "Terraform", "Docker", "CI/CD"],
    ["Go", "Microservices", "gRPC", "Kafka", "PostgreSQL"],
    ["Data Engineering", "Snowflake", "Spark", "Airflow", "Python"],
    ["Rust", "Distributed Systems", "WebAssembly", "C++"],
]

EXPERIENCE_LEVELS = ["junior", "mid", "senior", "lead"]
SOURCES = ["REMOTEOK", "ARBEITNOW", "REMOTIVE", "THEMUSE", "DIRECT"]
LOCATIONS = ["Worldwide Remote", "Americas (Remote)", "EMEA (Remote)", "APAC (Remote)", "US/Canada Remote"]

def generate_demo_jobs(count=50):
    jobs = []
    for i in range(count):
        title = random.choice(TITLES)
        company, logo = random.choice(COMPANIES)
        skills = random.choice(SKILL_SETS)
        exp = random.choice(EXPERIENCE_LEVELS)
        source = random.choice(SOURCES)
        loc = random.choice(LOCATIONS)
        
        salary_min = random.choice([90000, 110000, 130000, 150000, 180000, 200000])
        salary_max = salary_min + random.choice([20000, 30000, 40000, 50000])
        
        job = {
            "title": f"{title} #{i+1}",
            "description": f"We are seeking an experienced {title} to join our high-growth distributed team. You will design, build, and maintain production services, collaborate asynchronously across global timezones, and drive architectural excellence.",
            "company_name": company,
            "company_logo": logo,
            "location": loc,
            "is_remote": True,
            "job_type": random.choice(["full-time", "contract"]),
            "experience_level": exp,
            "salary_min": salary_min,
            "salary_max": salary_max,
            "currency": "USD",
            "skills": skills,
            "source": source,
            "external_url": f"https://workmesh.ai/jobs/demo-{i+1}",
        }
        jobs.append(job)
    return jobs

if __name__ == "__main__":
    import json
    jobs = generate_demo_jobs(50)
    print(f"Generated {len(jobs)} demo jobs.")
    with open("scripts/demo_jobs.json", "w") as f:
        json.dump(jobs, f, indent=2)
    print("Saved to scripts/demo_jobs.json")
